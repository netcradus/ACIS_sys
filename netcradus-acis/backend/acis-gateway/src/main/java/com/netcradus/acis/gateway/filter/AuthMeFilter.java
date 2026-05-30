package com.netcradus.acis.gateway.filter;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.common.dto.ApiResponse;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.ReactiveSecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Intercepts GET /api/auth/me and returns user profile from the JWT claims.
 * No downstream service required — the gateway reads the token directly.
 *
 * Runs at order = -10 (before routing, after Spring Security).
 */
@Component
public class AuthMeFilter implements GlobalFilter, Ordered {

    private final ObjectMapper objectMapper;

    public AuthMeFilter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public int getOrder() {
        return -10;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getPath().value();
        if (!"/api/auth/me".equals(path)) {
            return chain.filter(exchange);
        }

        return ReactiveSecurityContextHolder.getContext()
            .map(SecurityContext::getAuthentication)
            .cast(JwtAuthenticationToken.class)
            .flatMap(auth -> writeUserResponse(exchange, auth))
            .switchIfEmpty(Mono.defer(() -> {
                // Should not reach here if SecurityConfig is correct
                exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                return exchange.getResponse().setComplete();
            }));
    }

    private Mono<Void> writeUserResponse(ServerWebExchange exchange, JwtAuthenticationToken auth) {
        var jwt = auth.getToken();

        List<String> roles = auth.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .filter(a -> a.startsWith("ROLE_"))
            .map(a -> a.substring(5).toLowerCase())
            .toList();

        Map<String, Object> user = new LinkedHashMap<>();
        user.put("sub",               jwt.getSubject());
        user.put("email",             jwt.getClaimAsString("email"));
        user.put("name",              jwt.getClaimAsString("name"));
        user.put("preferredUsername", jwt.getClaimAsString("preferred_username"));
        user.put("roles",             roles);

        ApiResponse<Map<String, Object>> body = ApiResponse.success(user);

        var resp = exchange.getResponse();
        resp.setStatusCode(HttpStatus.OK);
        resp.getHeaders().setContentType(MediaType.APPLICATION_JSON);

        try {
            byte[] bytes = objectMapper.writeValueAsBytes(body);
            DataBuffer buffer = resp.bufferFactory().wrap(bytes);
            return resp.writeWith(Mono.just(buffer));
        } catch (JsonProcessingException e) {
            resp.setStatusCode(HttpStatus.INTERNAL_SERVER_ERROR);
            return resp.setComplete();
        }
    }
}
