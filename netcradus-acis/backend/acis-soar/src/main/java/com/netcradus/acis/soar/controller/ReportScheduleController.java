package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.soar.model.ReportSchedule;
import com.netcradus.acis.soar.repository.ReportScheduleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/soar/reports")
@RequiredArgsConstructor
public class ReportScheduleController {

    private final ReportScheduleRepository reportScheduleRepository;

    @GetMapping("/schedules")
    public ApiResponse<List<ReportSchedule>> getSchedules() {
        return ApiResponse.success(reportScheduleRepository.findAll());
    }

    @PostMapping("/schedules")
    public ApiResponse<ReportSchedule> createSchedule(@RequestBody ReportSchedule schedule) {
        if (schedule.getNextRun() == null) {
            schedule.setNextRun(OffsetDateTime.now().plusDays(7));
        }
        return ApiResponse.success(reportScheduleRepository.save(schedule));
    }

    @PutMapping("/schedules/{id}/status")
    public ApiResponse<ReportSchedule> toggleStatus(@PathVariable UUID id, @RequestParam String status) {
        return reportScheduleRepository.findById(id)
                .map(s -> {
                    s.setStatus(status);
                    return ApiResponse.success(reportScheduleRepository.save(s));
                })
                .orElse(ApiResponse.error("Schedule not found"));
    }

    @DeleteMapping("/schedules/{id}")
    public ApiResponse<String> deleteSchedule(@PathVariable UUID id) {
        reportScheduleRepository.deleteById(id);
        return ApiResponse.success("Deleted successfully");
    }
}
