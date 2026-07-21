package com.netcradus.acis.common.tenant;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.common.dto.ApiError;
import com.netcradus.acis.common.dto.ApiResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.Enumeration;
import java.util.UUID;

/**
 * Derives the current tenant strictly from the validated JWT's {@code tenant_id}
 * claim — never from a client-supplied header or request body field.
 *
 * Register with {@code .addFilterAfter(new TenantContextFilter(),
 * BearerTokenAuthenticationFilter.class)} in each service's SecurityConfig so it
 * runs after Spring Security has populated the SecurityContext with the verified
 * JwtAuthenticationToken.
 *
 * Any request whose JWT lacks a tenant_id claim is rejected with 403 — there is
 * no silent "demo tenant" fallback, because that fallback is what previously
 * caused cross-tenant data to be visible whenever a caller omitted tenant info.
 *
 * For backward compatibility with existing {@code @RequestHeader("X-Tenant-ID")}
 * controller parameters, the incoming request is wrapped so that header always
 * resolves to the JWT-derived tenant id, regardless of what the client sent.
 */
public class TenantContextFilter extends OncePerRequestFilter {

    public static final String TENANT_HEADER = "X-Tenant-ID";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();

        if (!(auth instanceof JwtAuthenticationToken jwtAuth)) {
            // Not a JWT-authenticated request (permitAll actuator/health, WS handshake, etc).
            filterChain.doFilter(request, response);
            return;
        }

        Jwt jwt = jwtAuth.getToken();
        String tenantId = jwt.getClaimAsString("tenant_id");

        if (tenantId == null || tenantId.isBlank()) {
            respondForbidden(response, ApiError.ERR_FORBIDDEN,
                    "Access token does not carry a tenant_id claim; request rejected.");
            return;
        }

        try {
            TenantContext.setTenantId(tenantId);
            TenantContext.setUserEmail(jwt.getClaimAsString("email"));
            String subject = jwt.getSubject();
            if (subject != null) {
                try {
                    TenantContext.setUserId(UUID.fromString(subject));
                } catch (IllegalArgumentException ignored) {
                    // Keycloak "sub" is a UUID by default; if it isn't, leave userId unset rather than guess.
                }
            }

            filterChain.doFilter(new TenantHeaderOverrideWrapper(request, tenantId), response);
        } finally {
            TenantContext.clear();
        }
    }

    private void respondForbidden(HttpServletResponse response, String code, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        ApiResponse<Void> body = ApiResponse.failure(code, message);
        response.getWriter().write(objectMapper.writeValueAsString(body));
    }

    private static final class TenantHeaderOverrideWrapper extends HttpServletRequestWrapper {
        private final String tenantId;

        TenantHeaderOverrideWrapper(HttpServletRequest request, String tenantId) {
            super(request);
            this.tenantId = tenantId;
        }

        @Override
        public String getHeader(String name) {
            if (TENANT_HEADER.equalsIgnoreCase(name)) {
                return tenantId;
            }
            return super.getHeader(name);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            if (TENANT_HEADER.equalsIgnoreCase(name)) {
                return Collections.enumeration(Collections.singletonList(tenantId));
            }
            return super.getHeaders(name);
        }
    }
}
