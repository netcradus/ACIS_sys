package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.soar.model.RedTeamSimulation;
import com.netcradus.acis.soar.model.RedTeamExecution;
import com.netcradus.acis.soar.service.RedTeamService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/red-team")
@RequiredArgsConstructor
public class RedTeamController {

    private final RedTeamService redTeamService;
    private final AuditEventPublisher auditEventPublisher;

    @GetMapping("/simulations")
    public ApiResponse<List<RedTeamSimulation>> getSimulations(@RequestHeader("X-Tenant-ID") UUID tenantId) {
        return ApiResponse.success(redTeamService.getSimulations(tenantId));
    }

    @PostMapping("/simulations")
    public ApiResponse<RedTeamSimulation> createSimulation(@RequestBody RedTeamSimulation simulation, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        simulation.setTenantId(tenantId);
        return ApiResponse.success(redTeamService.createSimulation(simulation));
    }

    @GetMapping("/simulations/{id}")
    public ApiResponse<RedTeamSimulation> getSimulation(@PathVariable UUID id, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        return redTeamService.getSimulation(id, tenantId)
                .map(ApiResponse::success)
                .orElse(ApiResponse.error("Simulation not found"));
    }

    @PostMapping("/simulations/{id}/start")
    public org.springframework.http.ResponseEntity<ApiResponse<RedTeamExecution>> startSimulation(
            @PathVariable UUID id, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        UUID userId = TenantContext.getUserId();
        RedTeamExecution execution = redTeamService.startSimulation(id, tenantId, userId);
        auditEventPublisher.publish("RED_TEAM_SIMULATION_START", "simulation/" + id, "execution=" + execution.getId());
        return org.springframework.http.ResponseEntity.accepted().body(ApiResponse.success(execution));
    }

    @GetMapping("/executions/{id}")
    public ApiResponse<RedTeamExecution> getExecution(@PathVariable UUID id, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        return redTeamService.getExecution(id, tenantId)
                .map(ApiResponse::success)
                .orElse(ApiResponse.error("Execution not found"));
    }

    @GetMapping("/executions")
    public ApiResponse<List<java.util.Map<String, Object>>> getAllExecutions(@RequestHeader("X-Tenant-ID") UUID tenantId) {
        return ApiResponse.success(redTeamService.getAllExecutionViews(tenantId));
    }
}
