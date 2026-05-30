package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.dto.ApiResponse;
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

    @GetMapping("/simulations")
    public ApiResponse<List<RedTeamSimulation>> getSimulations(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        if (tenantId == null) tenantId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        return ApiResponse.success(redTeamService.getSimulations(tenantId));
    }

    @PostMapping("/simulations")
    public ApiResponse<RedTeamSimulation> createSimulation(@RequestBody RedTeamSimulation simulation, @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        if (tenantId == null) tenantId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        simulation.setTenantId(tenantId);
        return ApiResponse.success(redTeamService.createSimulation(simulation));
    }

    @GetMapping("/simulations/{id}")
    public ApiResponse<RedTeamSimulation> getSimulation(@PathVariable UUID id) {
        return redTeamService.getSimulation(id)
                .map(ApiResponse::success)
                .orElse(ApiResponse.error("Simulation not found"));
    }

    @PostMapping("/simulations/{id}/start")
    public org.springframework.http.ResponseEntity<ApiResponse<RedTeamExecution>> startSimulation(@PathVariable UUID id) {
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000002");
        return org.springframework.http.ResponseEntity.accepted().body(ApiResponse.success(redTeamService.startSimulation(id, userId)));
    }

    @GetMapping("/executions/{id}")
    public ApiResponse<RedTeamExecution> getExecution(@PathVariable UUID id) {
        return redTeamService.getExecution(id)
                .map(ApiResponse::success)
                .orElse(ApiResponse.error("Execution not found"));
    }
}
