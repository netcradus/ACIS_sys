package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.soar.service.WafPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Tenant-facing WAF configuration (/api/soar/settings/waf — falls under the
 * existing "/api/soar/settings" -> Settings module RBAC mapping in
 * SecurityConfig, no new pathToModule entry needed) plus a bulk internal
 * endpoint acis-gateway's WafPolicyCache polls every 30s to keep its
 * in-memory policy cache current without a synchronous DB call on every
 * request.
 *
 * getAllPolicies() deliberately returns every tenant's WAF policy — that's
 * the whole point of the gateway's cache. InternalServiceKeyMatcher/
 * RbacEnforcementFilter only ever ADD a bypass for real internal callers;
 * they never PREVENT a normal, RBAC-permitted JWT from reaching this method
 * too (any authenticated user with READ on "SOAR Playbooks" in ANY tenant
 * could otherwise call this and see every OTHER tenant's WAF configuration —
 * a real cross-tenant IDOR, confirmed and fixed during the production-
 * readiness audit). Because this is the one endpoint whose entire job is to
 * cross tenant boundaries, it must check the key itself rather than relying
 * on the security-filter-chain bypass ordering the way every other genuinely
 * internal endpoint in this codebase safely does.
 */
@RestController
@RequestMapping("/api/soar")
@RequiredArgsConstructor
public class WafSettingsController {

    private final WafPolicyService wafPolicyService;
    private final AuditEventPublisher auditEventPublisher;

    @Value("${acis.internal-service-key}")
    private String internalServiceKey;

    public record WafPolicyRequest(String mode, List<String> disabledCategories) {}

    @GetMapping("/settings/waf")
    public ApiResponse<WafPolicyService.PolicyView> getPolicy(@RequestHeader("X-Tenant-ID") UUID tenantId) {
        return ApiResponse.success(wafPolicyService.getPolicy(tenantId));
    }

    @PutMapping("/settings/waf")
    public ApiResponse<WafPolicyService.PolicyView> updatePolicy(@RequestHeader("X-Tenant-ID") UUID tenantId,
            @RequestBody WafPolicyRequest request) {
        WafPolicyService.PolicyView updated = wafPolicyService.upsertPolicy(
                tenantId, request.mode(), request.disabledCategories());
        auditEventPublisher.publish("WAF_POLICY_UPDATE", "waf-policy/" + tenantId,
                "mode=" + updated.mode() + " disabledCategories=" + updated.disabledCategories());
        return ApiResponse.success(updated);
    }

    @GetMapping("/waf/internal/all")
    public ResponseEntity<Map<UUID, WafPolicyService.PolicyView>> getAllPolicies(
            @RequestHeader(value = "X-Internal-Service-Key", required = false) String providedKey) {
        if (internalServiceKey == null || internalServiceKey.isBlank() || !internalServiceKey.equals(providedKey)) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(wafPolicyService.getAllPolicies());
    }
}
