package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.soar.service.WafPolicyService;
import lombok.RequiredArgsConstructor;
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
 * request. The internal endpoint is reachable only with the shared
 * X-Internal-Service-Key header (see InternalServiceKeyMatcher /
 * RbacEnforcementFilter) — same mechanism already used by
 * IntegrationPollerService and AssetDriftDetectionService.
 */
@RestController
@RequestMapping("/api/soar")
@RequiredArgsConstructor
public class WafSettingsController {

    private final WafPolicyService wafPolicyService;
    private final AuditEventPublisher auditEventPublisher;

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
    public Map<UUID, WafPolicyService.PolicyView> getAllPolicies() {
        return wafPolicyService.getAllPolicies();
    }
}
