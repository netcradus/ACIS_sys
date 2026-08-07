package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.soar.model.ReportSchedule;
import com.netcradus.acis.soar.repository.ReportScheduleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/soar/reports")
@RequiredArgsConstructor
public class ReportScheduleController {

    private final ReportScheduleRepository reportScheduleRepository;

    /** Mirrors SettingsController.resolveTenant — X-Tenant-ID is always JWT-derived, never client-supplied. */
    private UUID resolveTenant(UUID tenantId) {
        if (tenantId == null) {
            throw new IllegalStateException("X-Tenant-ID missing; request should have been rejected upstream");
        }
        return tenantId;
    }

    @GetMapping("/schedules")
    public ApiResponse<List<ReportSchedule>> getSchedules(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return ApiResponse.success(reportScheduleRepository.findByTenantId(resolveTenant(tenantId)));
    }

    @PostMapping("/schedules")
    public ApiResponse<ReportSchedule> createSchedule(@RequestBody ReportSchedule schedule,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        schedule.setTenantId(resolveTenant(tenantId));
        if (schedule.getNextRun() == null) {
            schedule.setNextRun(OffsetDateTime.now().plusDays(7));
        }
        return ApiResponse.success(reportScheduleRepository.save(schedule));
    }

    @PutMapping("/schedules/{id}/status")
    public ResponseEntity<ApiResponse<ReportSchedule>> toggleStatus(@PathVariable UUID id, @RequestParam String status,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return reportScheduleRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(s -> {
                    s.setStatus(status);
                    return ResponseEntity.ok(ApiResponse.success(reportScheduleRepository.save(s)));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Schedule not found")));
    }

    @DeleteMapping("/schedules/{id}")
    public ResponseEntity<ApiResponse<String>> deleteSchedule(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return reportScheduleRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(s -> {
                    reportScheduleRepository.delete(s);
                    return ResponseEntity.ok(ApiResponse.success("Deleted successfully"));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Schedule not found")));
    }
}
