package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.soar.model.Playbook;
import com.netcradus.acis.soar.model.PlaybookExecution;
import com.netcradus.acis.soar.service.PlaybookService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/soar")
@RequiredArgsConstructor
public class PlaybookController {

    private final PlaybookService playbookService;

    @GetMapping("/playbooks")
    public ApiResponse<List<Playbook>> getPlaybooks(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        // Fallback to a mock tenant if not provided (for dev)
        if (tenantId == null) tenantId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        return ApiResponse.success(playbookService.getPlaybooks(tenantId));
    }

    @PostMapping("/playbooks")
    public ApiResponse<Playbook> createPlaybook(@RequestBody Playbook playbook, @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        if (tenantId == null) tenantId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        playbook.setTenantId(tenantId);
        return ApiResponse.success(playbookService.createPlaybook(playbook));
    }

    @GetMapping("/playbooks/{id}")
    public ApiResponse<Playbook> getPlaybook(@PathVariable UUID id) {
        return playbookService.getPlaybook(id)
                .map(ApiResponse::success)
                .orElse(ApiResponse.error("Playbook not found"));
    }

    @PostMapping("/playbooks/{id}/execute")
    public org.springframework.http.ResponseEntity<ApiResponse<PlaybookExecution>> executePlaybook(
            @PathVariable UUID id, 
            @RequestBody(required = false) java.util.Map<String, String> payload) {
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000002");
        java.util.Map<String, String> params = payload != null ? payload : new java.util.HashMap<>();
        PlaybookExecution execution = playbookService.startExecution(id, userId, params);
        return org.springframework.http.ResponseEntity.accepted().body(ApiResponse.success(execution));
    }

    @GetMapping("/executions/{id}")
    public ApiResponse<PlaybookExecution> getExecution(@PathVariable UUID id) {
        return playbookService.getExecution(id)
                .map(ApiResponse::success)
                .orElse(ApiResponse.error("Execution not found"));
    }

    @GetMapping("/executions")
    public ApiResponse<List<PlaybookExecution>> getAllExecutions() {
        return ApiResponse.success(playbookService.getAllExecutions());
    }
}
