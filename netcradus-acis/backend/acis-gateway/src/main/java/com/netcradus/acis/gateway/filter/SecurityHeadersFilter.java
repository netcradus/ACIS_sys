package com.netcradus.acis.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Real security response headers on every API response — this service has no
 * published host port (see docker-compose.prod.yml network isolation), so
 * every request reaching it has already crossed Caddy's TLS termination,
 * making HSTS safe to assert unconditionally here rather than gated on a
 * per-request scheme check. default-src 'none' is intentionally maximal: a
 * JSON API response should never execute a script or load a resource in a
 * browser context, unlike the frontend's own CSP (see nginx.conf.template)
 * which has to allow real script/style/image sources for the SPA itself.
 */
@Component
public class SecurityHeadersFilter implements GlobalFilter, Ordered {

    @Override
    public int getOrder() {
        return -30;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        HttpHeaders headers = exchange.getResponse().getHeaders();
        headers.add("X-Content-Type-Options", "nosniff");
        headers.add("X-Frame-Options", "DENY");
        headers.add("Referrer-Policy", "strict-origin-when-cross-origin");
        headers.add("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        headers.add("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
        headers.add("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
        return chain.filter(exchange);
    }
}
