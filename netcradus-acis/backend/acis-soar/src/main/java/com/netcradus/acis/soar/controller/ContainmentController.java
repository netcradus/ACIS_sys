package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.soar.model.ContainmentAction;
import com.netcradus.acis.soar.repository.ContainmentActionRepository;
import com.netcradus.acis.soar.service.ContainmentActionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Real containment-action history and rollback - falls under the existing
 * "/api/soar" -> SOAR Playbooks RBAC mapping. Rollback is only offered for
 * actions ContainmentAction.reversible=true; a real ended session cannot be
 * un-ended, so REVOKE_SESSIONS actions never appear as reversible here.
 */
@RestController
@RequestMapping("/api/soar/containment")
@RequiredArgsConstructor
public class ContainmentController {

    private final ContainmentActionRepository containmentActionRepository;
    private final ContainmentActionService containmentActionService;

    @GetMapping("/actions")
    public ApiResponse<List<ContainmentAction>> list(@RequestHeader("X-Tenant-ID") UUID tenantId) {
        return ApiResponse.success(containmentActionRepository.findByTenantIdOrderByCreatedAtDesc(tenantId));
    }

    @PostMapping("/actions/{id}/rollback")
    public ApiResponse<ContainmentAction> rollback(@PathVariable UUID id, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        String performedBy = TenantContext.getUserEmail();
        ContainmentAction action = containmentActionRepository.findByIdAndTenantId(id, tenantId).orElse(null);
        if (action == null) {
            return ApiResponse.error("Containment action not found");
        }
        if (!action.isReversible()) {
            return ApiResponse.error("This action type cannot be rolled back");
        }
        ContainmentActionService.Result result = switch (action.getActionType()) {
            case "DISABLE_ACCOUNT" -> containmentActionService.enableAccount(tenantId, id, performedBy);
            case "BLOCK_IP" -> containmentActionService.unblockIp(tenantId, id, performedBy);
            default -> new ContainmentActionService.Result(false, "No rollback handler for action type " + action.getActionType(), null);
        };
        return result.success() ? ApiResponse.success(result.action()) : ApiResponse.error(result.message());
    }

    /** Ad-hoc escalation, real Alert-based notification (see ContainmentActionService.escalate). */
    @PostMapping("/escalate")
    public ApiResponse<Void> escalate(@RequestHeader("X-Tenant-ID") UUID tenantId, @RequestBody Map<String, String> body) {
        String performedBy = TenantContext.getUserEmail();
        String summary = body.getOrDefault("summary", "Manual escalation");
        containmentActionService.escalate(tenantId, summary, performedBy);
        return ApiResponse.success(null);
    }
}
