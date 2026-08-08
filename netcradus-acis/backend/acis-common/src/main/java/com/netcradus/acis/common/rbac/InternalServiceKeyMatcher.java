package com.netcradus.acis.common.rbac;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * Matches a request carrying the correct X-Internal-Service-Key header —
 * used as a Spring Security .requestMatchers(...).permitAll() rule so a
 * genuine internal service-to-service call (AssetDriftDetectionService,
 * IntegrationPollerService, ComplianceService's synchronous asset lookup —
 * none of which have an end-user JWT to present) clears Spring Security's
 * OWN .authorizeHttpRequests() rules (.authenticated()/.hasAnyRole(...)),
 * not just RbacEnforcementFilter's check.
 *
 * RbacEnforcementFilter's own matching bypass (same header, same key) is
 * still required in addition to this: it runs earlier in the filter chain
 * than AuthorizationFilter (which is what actually evaluates this
 * permitAll rule), so without both, a request would sail past this
 * matcher only to still be rejected by RbacEnforcementFilter first, or
 * vice versa.
 */
public class InternalServiceKeyMatcher implements RequestMatcher {

    private static final String HEADER = "X-Internal-Service-Key";

    private final String expectedKey;

    public InternalServiceKeyMatcher(String expectedKey) {
        this.expectedKey = expectedKey;
    }

    @Override
    public boolean matches(HttpServletRequest request) {
        if (expectedKey == null || expectedKey.isBlank()) {
            return false;
        }
        return expectedKey.equals(request.getHeader(HEADER));
    }
}
