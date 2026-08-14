package com.netcradus.acis.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.common.dto.ApiError;
import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.common.dto.AlertDto;
import com.netcradus.acis.gateway.filter.waf.WafPolicyCache;
import com.netcradus.acis.gateway.filter.waf.WafRule;
import com.netcradus.acis.gateway.filter.waf.WafRuleEngine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpRequestDecorator;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Real signature-based WAF: inspects path, query string, and (capped,
 * text-typed) request body of every request reaching the gateway for SQLi,
 * XSS, command injection, path traversal, and RCE/deserialization
 * signatures (see WafRuleEngine). On a match, publishes a real Alert to
 * Kafka acis.alerts (same topic/consumer CorrelationEngine and
 * BruteForceAlertPublisher already feed — AlertConsumer in acis-alerts
 * persists it, so it shows up in Alerts/Dashboard/Correlation like any
 * other real detection) and, unless the tenant has switched that category
 * to MONITOR mode or disabled it (see WafPolicyCache / WafSettingsController
 * — the real false-positive escape hatch), blocks the request with a
 * generic 403 that never reveals which signature matched.
 *
 * Sits at order -15: after both rate limiters (-25/-20, cheap Redis-only
 * checks that should reject abusive traffic before this heavier body-read
 * work runs) and before AuthMeFilter (-10) and routing.
 *
 * No existing gateway filter reads the request body (confirmed by
 * inspection of every other GlobalFilter in this package) — this is the
 * first, so it must decorate the request to replay the body it consumed,
 * or every downstream service would see an empty body.
 */
@Component
public class WafInspectionFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(WafInspectionFilter.class);

    /** Never buffer more than 256KB of body for inspection — bounds memory use and keeps this off the critical path for large uploads. */
    private static final long MAX_BODY_INSPECT_BYTES = 262_144L;

    private static final Pattern SECRET_LIKE = Pattern.compile(
            "(?i)(password|passwd|secret|token|apikey|api_key|authorization)\\s*[:=]\\s*[\"']?[^&\\s\"',}]+");

    private final WafRuleEngine ruleEngine;
    private final WafPolicyCache policyCache;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper;

    public WafInspectionFilter(WafRuleEngine ruleEngine, WafPolicyCache policyCache,
            KafkaTemplate<String, Object> kafkaTemplate, ObjectMapper objectMapper) {
        this.ruleEngine = ruleEngine;
        this.policyCache = policyCache;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public int getOrder() {
        return -15;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        // Decoded, not raw: an attacker percent-encoding "union select" as
        // "%20union%20select" must still match the literal-space signatures
        // below, and getRawPath()/getRawQuery() would leave that encoding intact.
        String path = decode(request.getURI().getRawPath());
        String query = request.getURI().getRawQuery() != null ? decode(request.getURI().getRawQuery()) : null;
        String pathAndQuery = query != null ? path + "?" + query : path;

        boolean readBody = shouldReadBody(request);

        return resolveTenantId(exchange)
                .map(Optional::of)
                .defaultIfEmpty(Optional.empty())
                .flatMap(optTenant -> {
                    String tenantId = optTenant.orElse(null);
                    if (!readBody) {
                        WafRule matched = ruleEngine.match(pathAndQuery);
                        return handleResult(exchange, chain, matched, tenantId, pathAndQuery, "");
                    }
                    return DataBufferUtils.join(request.getBody())
                            .defaultIfEmpty(exchange.getResponse().bufferFactory().wrap(new byte[0]))
                            .flatMap(dataBuffer -> {
                                byte[] bytes = new byte[dataBuffer.readableByteCount()];
                                dataBuffer.read(bytes);
                                DataBufferUtils.release(dataBuffer);
                                String bodyStr = new String(bytes, StandardCharsets.UTF_8);

                                ServerHttpRequest decoratedRequest = new ServerHttpRequestDecorator(request) {
                                    @Override
                                    public Flux<DataBuffer> getBody() {
                                        if (bytes.length == 0) {
                                            return Flux.empty();
                                        }
                                        return Flux.just(exchange.getResponse().bufferFactory().wrap(bytes));
                                    }
                                };
                                ServerWebExchange mutatedExchange = exchange.mutate().request(decoratedRequest).build();

                                WafRule matched = ruleEngine.match(pathAndQuery + "\n" + bodyStr);
                                return handleResult(mutatedExchange, chain, matched, tenantId, pathAndQuery, bodyStr);
                            });
                });
    }

    private boolean shouldReadBody(ServerHttpRequest request) {
        HttpMethod method = request.getMethod();
        boolean mayHaveBody = HttpMethod.POST.equals(method) || HttpMethod.PUT.equals(method) || HttpMethod.PATCH.equals(method);
        if (!mayHaveBody) {
            return false;
        }
        long contentLength = request.getHeaders().getContentLength();
        if (contentLength <= 0 || contentLength > MAX_BODY_INSPECT_BYTES) {
            return false;
        }
        MediaType contentType = request.getHeaders().getContentType();
        if (contentType == null) {
            return true; // unlabeled small body — still worth a text scan
        }
        return MediaType.APPLICATION_JSON.isCompatibleWith(contentType)
                || MediaType.APPLICATION_FORM_URLENCODED.isCompatibleWith(contentType)
                || contentType.getType().equals("text");
    }

    private Mono<Void> handleResult(ServerWebExchange forwardExchange, GatewayFilterChain chain,
            WafRule matched, String tenantId, String pathAndQuery, String bodySnippet) {
        if (matched == null) {
            return chain.filter(forwardExchange);
        }
        if (policyCache.isCategoryDisabled(tenantId, matched.category())) {
            log.debug("WAF match {} suppressed — tenant {} has category {} disabled", matched.id(), tenantId, matched.category());
            return chain.filter(forwardExchange);
        }

        publishAlert(matched, tenantId, forwardExchange.getRequest(), pathAndQuery, bodySnippet);

        WafPolicyCache.PolicyView policy = policyCache.policyFor(tenantId);
        if ("MONITOR".equals(policy.mode())) {
            log.warn("WAF DETECTED (monitor-only) rule={} category={} tenant={} path={}",
                    matched.id(), matched.category(), tenantId, pathAndQuery);
            return chain.filter(forwardExchange);
        }

        log.warn("WAF BLOCKED rule={} category={} tenant={} path={}", matched.id(), matched.category(), tenantId, pathAndQuery);
        return writeBlocked(forwardExchange);
    }

    private void publishAlert(WafRule rule, String tenantId, ServerHttpRequest request, String pathAndQuery, String bodySnippet) {
        if (tenantId == null) {
            // Unauthenticated/permitAll route with no resolvable tenant — can't safely attribute
            // an Alert without corrupting tenant isolation, so log only. Real gap, documented as such.
            log.warn("WAF match on unauthenticated route, no tenant to attribute — rule={} path={}", rule.id(), pathAndQuery);
            return;
        }
        try {
            Map<String, Object> raw = new HashMap<>();
            raw.put("ruleId", rule.id());
            raw.put("category", rule.category().name());
            raw.put("method", request.getMethod() != null ? request.getMethod().name() : "UNKNOWN");
            raw.put("path", pathAndQuery);
            raw.put("sourceIp", resolveIp(request));
            raw.put("matchedSnippet", redact(truncate(bodySnippet, 200)));

            AlertDto alert = AlertDto.builder()
                    .tenantId(tenantId)
                    .title("WAF: " + rule.category().name() + " signature detected (" + rule.id() + ")")
                    .severity(rule.severity())
                    .source("WAF")
                    .status("OPEN")
                    .rawEvent(objectMapper.writeValueAsString(raw))
                    .eventOccurredAt(LocalDateTime.now())
                    .build();

            kafkaTemplate.send("acis.alerts", alert);
        } catch (Exception e) {
            log.warn("Failed to publish WAF alert for rule {}: {}", rule.id(), e.getMessage());
        }
    }

    private String decode(String raw) {
        if (raw == null) return null;
        try {
            return URLDecoder.decode(raw, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return raw; // malformed encoding - fall back to the raw form rather than dropping the check
        }
    }

    private String redact(String snippet) {
        if (snippet == null || snippet.isEmpty()) {
            return snippet;
        }
        return SECRET_LIKE.matcher(snippet).replaceAll("$1=[REDACTED]");
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "...";
    }

    private Mono<String> resolveTenantId(ServerWebExchange exchange) {
        return ReactiveSecurityContextHolder.getContext()
                .map(ctx -> ctx.getAuthentication())
                .cast(JwtAuthenticationToken.class)
                .mapNotNull(auth -> auth.getToken().getClaimAsString("tenant_id"))
                .onErrorResume(e -> Mono.empty());
    }

    private String resolveIp(ServerHttpRequest request) {
        String xff = request.getHeaders().getFirst("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        InetSocketAddress remote = request.getRemoteAddress();
        return remote != null ? remote.getAddress().getHostAddress() : "unknown";
    }

    private Mono<Void> writeBlocked(ServerWebExchange exchange) {
        ApiResponse<Void> body = ApiResponse.failure(ApiError.ERR_FORBIDDEN, "Request blocked by security policy.");

        var resp = exchange.getResponse();
        resp.setStatusCode(HttpStatus.FORBIDDEN);
        resp.getHeaders().setContentType(MediaType.APPLICATION_JSON);

        try {
            byte[] bytes = objectMapper.writeValueAsBytes(body);
            DataBuffer buffer = resp.bufferFactory().wrap(bytes);
            return resp.writeWith(Mono.just(buffer));
        } catch (Exception e) {
            return resp.setComplete();
        }
    }
}
