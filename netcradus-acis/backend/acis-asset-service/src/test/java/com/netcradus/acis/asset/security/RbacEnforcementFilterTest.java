package com.netcradus.acis.asset.security;

import com.netcradus.acis.common.rbac.PermissionLevel;
import com.netcradus.acis.common.rbac.PermissionResolver;
import com.netcradus.acis.common.rbac.RbacEnforcementFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.LinkedHashMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Real coverage of {@link RbacEnforcementFilter} — the actual RBAC
 * enforcement point in this codebase (RLS handles tenant isolation at the DB
 * layer; this filter is what enforces per-module READ/WRITE/ADMIN access in
 * application code). Wired here with the exact path->module mapping
 * acis-asset-service's own SecurityConfig registers
 * ("/api/assets" -> "Assets & Threat Intel"), so this exercises the real
 * production wiring, not a hypothetical one.
 *
 * PermissionResolver is mocked deliberately — per the task brief, RBAC
 * (unlike RLS) is enforced entirely in application code, not the database,
 * so mocking the permission-lookup boundary here is a legitimate test of the
 * filter's real enforcement logic (method -> required level, level
 * comparison, 403 response shape), not a bypass of anything meaningful.
 */
class RbacEnforcementFilterTest {

    private static final String MODULE = "Assets & Threat Intel";
    private static final String INTERNAL_KEY = "test-internal-key";

    private PermissionResolver permissionResolver;
    private RbacEnforcementFilter filter;

    @BeforeEach
    void setUp() {
        permissionResolver = mock(PermissionResolver.class);
        LinkedHashMap<String, String> pathToModule = new LinkedHashMap<>();
        pathToModule.put("/api/assets", MODULE);
        filter = new RbacEnforcementFilter(permissionResolver, pathToModule, INTERNAL_KEY);
    }

    private MockHttpServletResponse runFilter(String method, String uri) throws Exception {
        return runFilter(method, uri, null);
    }

    private MockHttpServletResponse runFilter(String method, String uri, String internalKeyHeader) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        if (internalKeyHeader != null) {
            request.addHeader("X-Internal-Service-Key", internalKeyHeader);
        }
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }

    @Test
    void adminRoleIsAllowedOnAdminOnlyDeleteEndpoint() throws Exception {
        when(permissionResolver.resolve(MODULE)).thenReturn(PermissionLevel.ADMIN);

        MockHttpServletResponse response = runFilter("DELETE", "/api/assets/abc-123");

        assertThat(response.getStatus()).isEqualTo(200); // reached the end of the chain
    }

    @Test
    void writeLevelRoleIsAllowedOnAWriteEndpoint() throws Exception {
        when(permissionResolver.resolve(MODULE)).thenReturn(PermissionLevel.WRITE);

        MockHttpServletResponse response = runFilter("POST", "/api/assets");

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void readOnlyRoleIsAllowedOnAReadEndpoint() throws Exception {
        when(permissionResolver.resolve(MODULE)).thenReturn(PermissionLevel.READ);

        MockHttpServletResponse response = runFilter("GET", "/api/assets");

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void readOnlyRoleIsDeniedOnAWriteEndpoint() throws Exception {
        when(permissionResolver.resolve(MODULE)).thenReturn(PermissionLevel.READ);

        MockHttpServletResponse response = runFilter("POST", "/api/assets");

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("does not have WRITE access");
    }

    @Test
    void writeLevelRoleIsDeniedOnAnAdminOnlyDeleteEndpoint() throws Exception {
        when(permissionResolver.resolve(MODULE)).thenReturn(PermissionLevel.WRITE);

        MockHttpServletResponse response = runFilter("DELETE", "/api/assets/abc-123");

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("does not have ADMIN access");
    }

    @Test
    void noRoleResolvesToNoneAndIsDenied() throws Exception {
        // Mirrors what PermissionResolver.resolve() genuinely returns for a
        // request with no valid tenant/user context at all (missing JWT
        // tenant_id claim, or no UserMember row) — deny-by-default, never an
        // assumed access level.
        when(permissionResolver.resolve(MODULE)).thenReturn(PermissionLevel.NONE);

        MockHttpServletResponse response = runFilter("GET", "/api/assets");

        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void validInternalServiceKeyBypassesThePermissionCheckEntirely() throws Exception {
        MockHttpServletResponse response = runFilter("DELETE", "/api/assets/abc-123", INTERNAL_KEY);

        assertThat(response.getStatus()).isEqualTo(200);
        verifyNoInteractions(permissionResolver);
    }

    @Test
    void wrongInternalServiceKeyDoesNotBypassAndFallsThroughToTheNormalCheck() throws Exception {
        when(permissionResolver.resolve(MODULE)).thenReturn(PermissionLevel.NONE);

        MockHttpServletResponse response = runFilter("GET", "/api/assets", "wrong-key");

        assertThat(response.getStatus()).isEqualTo(403);
    }

    @Test
    void myPermissionsPathIsAlwaysReachableRegardlessOfModulePermission() throws Exception {
        MockHttpServletResponse response = runFilter("GET", "/api/soar/settings/my-permissions");

        assertThat(response.getStatus()).isEqualTo(200);
        verifyNoInteractions(permissionResolver);
    }

    @Test
    void pathWithNoConfiguredModulePassesThroughUnchecked() throws Exception {
        MockHttpServletResponse response = runFilter("DELETE", "/actuator/health");

        assertThat(response.getStatus()).isEqualTo(200);
        verifyNoInteractions(permissionResolver);
    }
}
