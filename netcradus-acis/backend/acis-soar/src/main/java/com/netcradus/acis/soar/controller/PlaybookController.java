package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.soar.model.Playbook;
import com.netcradus.acis.soar.model.PlaybookExecution;
import com.netcradus.acis.soar.service.ApprovalService;
import com.netcradus.acis.soar.service.PlaybookService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/soar")
@RequiredArgsConstructor
public class PlaybookController {

    private final PlaybookService playbookService;
    private final AuditEventPublisher auditEventPublisher;
    private final ApprovalService approvalService;

    @GetMapping("/playbooks")
    public ApiResponse<List<Playbook>> getPlaybooks(@RequestHeader("X-Tenant-ID") UUID tenantId) {
        return ApiResponse.success(playbookService.getPlaybooks(tenantId));
    }

    @GetMapping("/playbooks/dependencies")
    public ApiResponse<java.util.Map<String, Object>> getPlaybookDependencies(@RequestHeader("X-Tenant-ID") UUID tenantId) {
        return ApiResponse.success(playbookService.getDependencyGraph(tenantId));
    }

    @PostMapping("/playbooks")
    public ApiResponse<Playbook> createPlaybook(@RequestBody Playbook playbook, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        playbook.setTenantId(tenantId);
        return ApiResponse.success(playbookService.createPlaybook(playbook));
    }

    @GetMapping("/playbooks/{id}")
    public ApiResponse<Playbook> getPlaybook(@PathVariable UUID id, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        return playbookService.getPlaybook(id, tenantId)
                .map(ApiResponse::success)
                .orElse(ApiResponse.error("Playbook not found"));
    }

    @PutMapping("/playbooks/{id}")
    public ApiResponse<Playbook> updatePlaybook(@PathVariable UUID id, @RequestBody Playbook playbook,
            @RequestHeader("X-Tenant-ID") UUID tenantId) {
        return playbookService.updatePlaybook(id, tenantId, playbook)
                .map(saved -> {
                    auditEventPublisher.publish("PLAYBOOK_UPDATE", "playbook/" + id, "updated");
                    return ApiResponse.success(saved);
                })
                .orElse(ApiResponse.error("Playbook not found"));
    }

    /**
     * Real high-impact playbooks (any step touching account/session/endpoint/
     * network containment - see ApprovalService.isHighRisk) do not execute
     * here at all - they return a PENDING containment approval instead, and
     * only actually run once a second, different user approves it via
     * ApprovalController. Low-risk playbooks still execute immediately, same
     * as before.
     */
    @PostMapping("/playbooks/{id}/execute")
    public org.springframework.http.ResponseEntity<ApiResponse<java.util.Map<String, Object>>> executePlaybook(
            @PathVariable UUID id,
            @RequestBody(required = false) java.util.Map<String, String> payload,
            @RequestHeader("X-Tenant-ID") UUID tenantId,
            HttpServletRequest request) {
        UUID userId = TenantContext.getUserId();
        String userEmail = TenantContext.getUserEmail();
        String authHeader = request.getHeader("Authorization");
        String bearerToken = authHeader != null && authHeader.startsWith("Bearer ")
                ? authHeader.substring("Bearer ".length()) : null;

        java.util.Map<String, String> params = payload != null ? payload : new java.util.HashMap<>();
        ApprovalService.ExecutionOutcome outcome = approvalService.requestOrExecute(id, tenantId, userId, userEmail, bearerToken, params);

        java.util.Map<String, Object> body = new java.util.HashMap<>();
        if (outcome instanceof ApprovalService.Executed executed) {
            auditEventPublisher.publish("PLAYBOOK_EXECUTE", "playbook/" + id, "execution=" + executed.execution().getId());
            body.put("outcome", "EXECUTING");
            body.put("execution", executed.execution());
        } else if (outcome instanceof ApprovalService.PendingApproval pending) {
            body.put("outcome", "PENDING_APPROVAL");
            body.put("approval", pending.approval());
        }
        return org.springframework.http.ResponseEntity.accepted().body(ApiResponse.success(body));
    }

    @GetMapping("/executions/{id}")
    public ApiResponse<PlaybookExecution> getExecution(@PathVariable UUID id, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        return playbookService.getExecution(id, tenantId)
                .map(ApiResponse::success)
                .orElse(ApiResponse.error("Execution not found"));
    }

    @GetMapping("/executions")
    public ApiResponse<List<PlaybookExecution>> getAllExecutions(@RequestHeader("X-Tenant-ID") UUID tenantId) {
        return ApiResponse.success(playbookService.getAllExecutions(tenantId));
    }
}
