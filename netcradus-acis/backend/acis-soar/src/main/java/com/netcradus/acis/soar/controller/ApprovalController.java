package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.soar.model.ContainmentApproval;
import com.netcradus.acis.soar.service.ApprovalService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Real two-person-integrity approval workflow for high-impact playbook
 * executions - falls under the existing "/api/soar" -> SOAR Playbooks RBAC
 * mapping. See ApprovalService for the actual approve/reject safeguards.
 */
@RestController
@RequestMapping("/api/soar/approvals")
@RequiredArgsConstructor
public class ApprovalController {

    private final ApprovalService approvalService;

    @GetMapping
    public ApiResponse<List<ContainmentApproval>> list(@RequestHeader("X-Tenant-ID") UUID tenantId) {
        return ApiResponse.success(approvalService.list(tenantId));
    }

    @PostMapping("/{id}/approve")
    public ApiResponse<ContainmentApproval> approve(@PathVariable UUID id, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        try {
            UUID approverId = TenantContext.getUserId();
            String approverEmail = TenantContext.getUserEmail();
            return ApiResponse.success(approvalService.approve(id, tenantId, approverId, approverEmail));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PostMapping("/{id}/reject")
    public ApiResponse<ContainmentApproval> reject(@PathVariable UUID id, @RequestHeader("X-Tenant-ID") UUID tenantId,
            @RequestBody(required = false) Map<String, String> body) {
        try {
            UUID approverId = TenantContext.getUserId();
            String approverEmail = TenantContext.getUserEmail();
            String reason = body != null ? body.getOrDefault("reason", "No reason given") : "No reason given";
            return ApiResponse.success(approvalService.reject(id, tenantId, approverId, approverEmail, reason));
        } catch (IllegalStateException | IllegalArgumentException e) {
            return ApiResponse.error(e.getMessage());
        }
    }
}
