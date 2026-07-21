package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.soar.model.Playbook;
import com.netcradus.acis.soar.model.PlaybookExecution;
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

    @GetMapping("/playbooks")
    public ApiResponse<List<Playbook>> getPlaybooks(@RequestHeader("X-Tenant-ID") UUID tenantId) {
        return ApiResponse.success(playbookService.getPlaybooks(tenantId));
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

    @PostMapping("/playbooks/{id}/execute")
    public org.springframework.http.ResponseEntity<ApiResponse<PlaybookExecution>> executePlaybook(
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
        PlaybookExecution execution = playbookService.startExecution(id, tenantId, userId, userEmail, bearerToken, params);
        auditEventPublisher.publish("PLAYBOOK_EXECUTE", "playbook/" + id, "execution=" + execution.getId());
        return org.springframework.http.ResponseEntity.accepted().body(ApiResponse.success(execution));
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
