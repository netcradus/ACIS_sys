package com.netcradus.acis.ingestion.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.common.apikey.ApiKey;
import com.netcradus.acis.common.apikey.ApiKeyRepository;
import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.common.tenant.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Optional;

/**
 * Authenticates requests to /api/ingest/external/** using a tenant-scoped API
 * key instead of a Keycloak JWT — this is the path an external system (e.g. a
 * customer's own CRM/web server) uses to ship logs into ACIS, so it can't be
 * expected to hold a Keycloak-issued token the way the rest of the app does.
 *
 * The key travels in a dedicated X-API-Key header rather than
 * "Authorization: Bearer" — deliberately, not just by convention: the
 * gateway's oauth2ResourceServer().jwt() filter intercepts ANY Authorization:
 * Bearer header on ANY path and tries to decode it as a JWT before
 * authorization rules (including permitAll) are even evaluated, since
 * authentication runs before authorization in the filter chain. A raw API
 * key sent that way gets rejected with "Invalid JWT serialization" at the
 * gateway, never reaching this filter at all. X-API-Key sidesteps that
 * filter entirely.
 *
 * The gateway permits this specific path without a JWT (see acis-gateway's
 * SecurityConfig); this filter is what actually enforces authentication for
 * it instead. Everything else this service exposes (/api/ingest/syslog,
 * /api/ingest/json) is untouched and still JWT-only.
 *
 * Runs before TenantContextFilter, which is a harmless no-op here since there
 * is no JwtAuthenticationToken on this path — it just passes the request
 * through once this filter has already set TenantContext from the API key.
 */
@Slf4j
@RequiredArgsConstructor
public class ApiKeyAuthFilter extends OncePerRequestFilter {

    private static final String EXTERNAL_PATH_PREFIX = "/api/ingest/external/";

    private final ApiKeyRepository apiKeyRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (!request.getRequestURI().startsWith(EXTERNAL_PATH_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        String rawToken = request.getHeader("X-API-Key");
        if (rawToken == null || rawToken.isBlank()) {
            respondUnauthorized(response, "Missing X-API-Key header.");
            return;
        }

        String tokenHash = hashToken(rawToken.trim());

        // The one query in this codebase that legitimately needs to see api_keys
        // rows across every tenant, since we don't know the tenant until this
        // lookup succeeds — see TenantContext.setApiKeyLookupInProgress and the
        // matching RLS policy in acis-soar's RlsConfig for why this is safe.
        Optional<ApiKey> found;
        try {
            TenantContext.setApiKeyLookupInProgress(true);
            found = apiKeyRepository.findByTokenHash(tokenHash);
        } finally {
            TenantContext.setApiKeyLookupInProgress(false);
        }
        if (found.isEmpty()) {
            respondUnauthorized(response, "Invalid API key.");
            return;
        }

        ApiKey key = found.get();
        if (!"Active".equals(key.getStatus())) {
            respondUnauthorized(response, "This API key has been revoked.");
            return;
        }

        try {
            TenantContext.setTenantId(key.getTenantId().toString());

            key.setLastUsedAt(OffsetDateTime.now());
            apiKeyRepository.save(key);

            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private void respondUnauthorized(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write(objectMapper.writeValueAsString(ApiResponse.error(message)));
    }
}
