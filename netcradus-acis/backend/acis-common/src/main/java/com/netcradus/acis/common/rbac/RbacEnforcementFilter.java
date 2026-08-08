package com.netcradus.acis.common.rbac;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.common.dto.ApiResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The actual enforcement point: maps the request path to a module (via a
 * per-service, longest-prefix-first path→module table), derives the
 * required PermissionLevel from the HTTP method, resolves the caller's real
 * level via PermissionResolver, and rejects with 403 if it's insufficient.
 * Requests to paths with no configured module (nothing in pathToModule
 * matches) pass through unchecked — RBAC only governs modules that are
 * explicitly wired into it below.
 *
 * Must run after TenantContextFilter (needs TenantContext.tenantId/userEmail
 * already populated from the validated JWT) and after JWT authentication.
 *
 * Method → required level, deliberately simple and uniform rather than
 * per-endpoint: GET/HEAD/OPTIONS need READ, DELETE needs ADMIN, everything
 * else (POST/PUT/PATCH) needs WRITE.
 *
 * Real, genuinely-internal service-to-service calls (a @Scheduled job with
 * no end-user request to derive a JWT from — AssetDriftDetectionService,
 * IntegrationPollerService — plus ComplianceService's synchronous asset
 * lookup) carry no Authorization header at all, so PermissionResolver
 * always resolves them to NONE and every one of these was silently
 * rejected — confirmed live: none of GuardDuty/Azure AD indicator
 * bridging, the Endpoints self-healing drift detector, or Compliance's
 * Asset Management control ever actually worked, each failing closed into
 * its own honest-degradation path rather than crashing, which is exactly
 * why this went unnoticed. internalServiceKey is a shared secret (see each
 * service's application.yml/docker-compose) these specific callers attach
 * as X-Internal-Service-Key; a request presenting the correct value skips
 * the permission check entirely, matching a real system action rather than
 * a user's — distinct from, and never a substitute for, the per-user JWT
 * path everything else in this filter still enforces.
 */
public class RbacEnforcementFilter extends OncePerRequestFilter {

    private static final String INTERNAL_SERVICE_HEADER = "X-Internal-Service-Key";

    private final PermissionResolver permissionResolver;
    private final LinkedHashMap<String, String> pathToModule;
    private final String internalServiceKey;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public RbacEnforcementFilter(PermissionResolver permissionResolver, LinkedHashMap<String, String> pathToModule,
            String internalServiceKey) {
        this.permissionResolver = permissionResolver;
        this.pathToModule = pathToModule;
        this.internalServiceKey = internalServiceKey;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (internalServiceKey != null && !internalServiceKey.isBlank()
                && internalServiceKey.equals(request.getHeader(INTERNAL_SERVICE_HEADER))) {
            filterChain.doFilter(request, response);
            return;
        }

        String uri = request.getRequestURI();
        // Every authenticated user must always be able to read their own
        // resolved permissions (that's precisely what drives frontend
        // gating) — this can't itself be gated by a module permission, or a
        // user without Settings access could never learn what they DO have
        // access to. Read-only, scoped to the caller by TenantContext, so
        // this is safe to exempt regardless of module path structure.
        if (uri.endsWith("/my-permissions")) {
            filterChain.doFilter(request, response);
            return;
        }
        // Same rationale: every authenticated user must always be able to
        // view/edit their own profile, regardless of what Settings-module
        // permission (if any) their Console Role grants — see
        // SecurityConfig's matching authenticated()-only carve-out and
        // ProfileController.
        if (uri.endsWith("/settings/profile")) {
            filterChain.doFilter(request, response);
            return;
        }
        String module = null;
        for (Map.Entry<String, String> entry : pathToModule.entrySet()) {
            if (uri.startsWith(entry.getKey())) {
                module = entry.getValue();
                break;
            }
        }
        if (module == null) {
            filterChain.doFilter(request, response);
            return;
        }

        PermissionLevel required = requiredLevelFor(request.getMethod());
        PermissionLevel actual = permissionResolver.resolve(module);
        if (!actual.atLeast(required)) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write(objectMapper.writeValueAsString(ApiResponse.error(
                    "Your role does not have " + required + " access to " + module
                            + " (you have " + actual + ")")));
            return;
        }

        filterChain.doFilter(request, response);
    }

    private PermissionLevel requiredLevelFor(String method) {
        return switch (method) {
            case "GET", "HEAD", "OPTIONS" -> PermissionLevel.READ;
            case "DELETE" -> PermissionLevel.ADMIN;
            default -> PermissionLevel.WRITE;
        };
    }
}
