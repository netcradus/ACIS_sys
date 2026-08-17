package com.netcradus.acis.gateway.filter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.common.dto.ApiError;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;
import java.time.Duration;

/**
 * Real distributed rate limiter — 1000 requests per minute per TENANT
 * (falling back to per-IP for requests with no authenticated tenant, e.g.
 * permitAll paths), backed by Redis so the count is real and shared across
 * every gateway instance, not per-process. Keying by tenant rather than by
 * caller IP means one tenant's traffic spike can't be split across many
 * source IPs to evade the limit, and one noisy tenant can't be conflated
 * with — or blamed on — another tenant sharing a NAT'd/proxied IP.
 *
 * Fixed 60-second window: INCR the key, and only the request that creates
 * the key (count == 1) sets its 60s expiry — every other request in the
 * window just increments, so the window doesn't keep sliding forward on
 * continued traffic the way a naive "reset TTL on every hit" version would.
 */
@Component
public class RateLimiterFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(RateLimiterFilter.class);
    private static final long MAX_REQUESTS_PER_MINUTE = 1000L;
    private static final Duration WINDOW = Duration.ofSeconds(60);

    private final ReactiveStringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final int trustedProxyHops;

    public RateLimiterFilter(ReactiveStringRedisTemplate redisTemplate, ObjectMapper objectMapper,
            @org.springframework.beans.factory.annotation.Value("${acis.trusted-proxy-hops:0}") int trustedProxyHops) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.trustedProxyHops = trustedProxyHops;
    }

    @Override
    public int getOrder() {
        return -20;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        return resolveKey(exchange).flatMap(key -> {
            String redisKey = "ratelimit:" + key;
            return redisTemplate.opsForValue().increment(redisKey)
                    .flatMap(count -> {
                        Mono<Boolean> ensureTtl = count == 1
                                ? redisTemplate.expire(redisKey, WINDOW)
                                : Mono.just(true);
                        return ensureTtl.thenReturn(count);
                    })
                    .flatMap(count -> {
                        if (count > MAX_REQUESTS_PER_MINUTE) {
                            log.warn("Rate limit exceeded for key={} count={}", key, count);
                            return writeTooManyRequests(exchange);
                        }
                        return chain.filter(exchange);
                    })
                    // Redis being briefly unavailable must not take the whole
                    // gateway down with it — fail open (same posture every
                    // other real poller/consumer in this codebase takes on a
                    // downstream dependency hiccup) and let the request through.
                    .onErrorResume(e -> {
                        log.warn("Rate limiter Redis call failed, allowing request through: {}", e.getMessage());
                        return chain.filter(exchange);
                    });
        });
    }

    /** Tenant ID from the validated JWT if present, else "ip:<address>" as a fallback key. */
    private Mono<String> resolveKey(ServerWebExchange exchange) {
        return ReactiveSecurityContextHolder.getContext()
                .map(ctx -> ctx.getAuthentication())
                .cast(JwtAuthenticationToken.class)
                .mapNotNull(auth -> auth.getToken().getClaimAsString("tenant_id"))
                .map(tenantId -> "tenant:" + tenantId)
                .switchIfEmpty(Mono.fromSupplier(() -> "ip:" + resolveIp(exchange)))
                .onErrorReturn("ip:" + resolveIp(exchange));
    }

    /**
     * See PreAuthRateLimiterFilter.resolveIp's javadoc for the full
     * explanation - both proxies in front of this gateway APPEND to
     * X-Forwarded-For rather than replace it, so the first entry is
     * attacker-controlled and must never be trusted directly. Trusts exactly
     * acis.trusted-proxy-hops entries from the end (0 by default = ignore
     * XFF, use the raw TCP peer).
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
                ApiError.ERR_RATE_LIMITED, "Rate limit exceeded. Max 1000 requests/minute.");

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
