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
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * In-memory rate limiter — 1000 requests per minute per IP.
 * Uses ConcurrentHashMap + AtomicLong counters, reset every 60s via @Scheduled.
 * No Redis dependency. Runs at order -20 (before AuthMeFilter).
 */
@Component
public class RateLimiterFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(RateLimiterFilter.class);
    private static final long MAX_REQUESTS_PER_MINUTE = 1000L;

    private final ConcurrentHashMap<String, AtomicLong> counters = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper;

    public RateLimiterFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public int getOrder() {
        return -20;
    }

    /** Reset all counters every 60 seconds. */
    @Scheduled(fixedRate = 60_000)
    public void resetCounters() {
        int size = counters.size();
        counters.clear();
        if (size > 0) log.debug("Rate limiter: cleared {} IP counters", size);
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String key = resolveKey(exchange);
        long count = counters.computeIfAbsent(key, k -> new AtomicLong(0)).incrementAndGet();

        if (count > MAX_REQUESTS_PER_MINUTE) {
            log.warn("Rate limit exceeded for key={} count={}", key, count);
            return writeTooManyRequests(exchange);
        }

        return chain.filter(exchange);
    }

    private String resolveKey(ServerWebExchange exchange) {
        // Prefer X-Forwarded-For if behind a proxy; fallback to remote addr
        String xff = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
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
