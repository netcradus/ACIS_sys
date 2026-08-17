package com.netcradus.acis.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.common.dto.ApiError;
import com.netcradus.acis.common.dto.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;
import java.time.Duration;

/**
 * A real, much tighter limiter specifically for the gateway's permitAll
 * paths (see SecurityConfig) — the only ones actually reachable pre-auth,
 * since Keycloak (not this gateway) fronts the real login endpoint and
 * already has its own real brute-force protection. These paths have no JWT
 * to key a limit on, only an IP, and cover exactly the abuse surface that
 * matters here: guessing invite/activation tokens, signup spam, and
 * API-key-authenticated ingest floods. 20 requests/minute per IP - real
 * traffic through these paths is inherently low-frequency (a human accepting
 * one invite, an agent sending one heartbeat), so this is deliberately far
 * tighter than the general 1000/min tenant limit.
 */
@Component
public class PreAuthRateLimiterFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(PreAuthRateLimiterFilter.class);
    private static final long MAX_REQUESTS_PER_MINUTE = 20L;
    private static final Duration WINDOW = Duration.ofSeconds(60);

    private static final String[] PROTECTED_PREFIXES = {
            "/api/platform/signup",
            "/api/platform/activate/",
            "/api/invitations/",
            "/api/agent/",
            "/api/ingest/external/",
            "/services/collector/"
    };

    private final ReactiveStringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final int trustedProxyHops;

    public PreAuthRateLimiterFilter(ReactiveStringRedisTemplate redisTemplate, ObjectMapper objectMapper,
            @org.springframework.beans.factory.annotation.Value("${acis.trusted-proxy-hops:0}") int trustedProxyHops) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.trustedProxyHops = trustedProxyHops;
    }

    // Runs before RateLimiterFilter (-20) so an abusive pre-auth caller gets
    // stopped by the tight limit first, rather than also consuming budget
    // from the general per-IP fallback limit.
    @Override
    public int getOrder() {
        return -25;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        if (!isProtected(path)) {
            return chain.filter(exchange);
        }

        String key = "preauth-ratelimit:" + resolveIp(exchange);
        return redisTemplate.opsForValue().increment(key)
                .flatMap(count -> {
                    Mono<Boolean> ensureTtl = count == 1 ? redisTemplate.expire(key, WINDOW) : Mono.just(true);
                    return ensureTtl.thenReturn(count);
                })
                .flatMap(count -> {
                    if (count > MAX_REQUESTS_PER_MINUTE) {
                        log.warn("Pre-auth rate limit exceeded for path={} key={} count={}", path, key, count);
                        return writeTooManyRequests(exchange);
                    }
                    return chain.filter(exchange);
                })
                .onErrorResume(e -> {
                    log.warn("Pre-auth rate limiter Redis call failed, allowing request through: {}", e.getMessage());
                    return chain.filter(exchange);
                });
    }

    private boolean isProtected(String path) {
        for (String prefix : PROTECTED_PREFIXES) {
            if (path.startsWith(prefix)) return true;
        }
        return false;
    }

    /**
     * Real client IP, resistant to X-Forwarded-For spoofing. Both proxies in
     * front of this gateway in prod (Caddy, then nginx — see
     * infra/caddy/Caddyfile and infra/docker/nginx.conf.template) APPEND to
     * X-Forwarded-For rather than replace it, so naively trusting the FIRST
     * entry (the previous behavior) let any client set
     * "X-Forwarded-For: &lt;anything&gt;" and have it used verbatim as the rate-
     * limit key — a real, confirmed bypass of the very limiter this class
     * exists to enforce (fixed during the production-readiness audit).
     *
     * The fix trusts exactly acis.trusted-proxy-hops entries counted from the
     * END of the list (each real proxy hop appends one, so the Nth-from-last
     * is the innermost proxy's own view of the real client) and ignores
     * everything before that, which is attacker-controlled. Defaults to 0
     * (ignore X-Forwarded-For entirely, use the raw TCP peer) so an
     * unconfigured deployment fails SAFE rather than trusting a spoofable
     * header — set TRUSTED_PROXY_HOPS=2 in prod (Caddy + nginx).
     */
    private String resolveIp(ServerWebExchange exchange) {
        if (trustedProxyHops > 0) {
            String xff = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
            if (xff != null && !xff.isBlank()) {
                String[] parts = xff.split(",");
                if (parts.length >= trustedProxyHops) {
                    return parts[parts.length - trustedProxyHops].trim();
                }
            }
        }
        InetSocketAddress remote = exchange.getRequest().getRemoteAddress();
        return remote != null ? remote.getAddress().getHostAddress() : "unknown";
    }

    private Mono<Void> writeTooManyRequests(ServerWebExchange exchange) {
        ApiResponse<Void> body = ApiResponse.failure(
                ApiError.ERR_RATE_LIMITED, "Rate limit exceeded. Max 20 requests/minute on this endpoint.");

        var resp = exchange.getResponse();
        resp.setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
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
