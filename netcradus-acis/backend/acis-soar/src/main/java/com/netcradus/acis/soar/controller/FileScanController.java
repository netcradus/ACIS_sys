package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.soar.model.FileScanResult;
import com.netcradus.acis.soar.service.FileScanService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * Real malware/file scanning under /api/soar/files - falls under the
 * existing catch-all "/api/soar" -> SOAR Playbooks module RBAC mapping in
 * SecurityConfig, no new pathToModule entry needed.
 */
@RestController
@RequestMapping("/api/soar/files")
@RequiredArgsConstructor
public class FileScanController {

    private final FileScanService fileScanService;

    @PostMapping("/scan")
    public ApiResponse<FileScanResult> scan(@RequestParam("file") MultipartFile file,
            @RequestHeader("X-Tenant-ID") UUID tenantId) {
        try {
            String uploadedBy = TenantContext.getUserEmail();
            FileScanResult result = fileScanService.scanAndStore(file, tenantId, uploadedBy);
            return ApiResponse.success(result);
        } catch (IllegalArgumentException e) {
            return ApiResponse.error(e.getMessage());
        } catch (IOException e) {
            return ApiResponse.error("Failed to read uploaded file: " + e.getMessage());
        }
    }

    @GetMapping
    public ApiResponse<List<FileScanResult>> list(@RequestHeader("X-Tenant-ID") UUID tenantId) {
        return ApiResponse.success(fileScanService.listForTenant(tenantId));
    }

    @GetMapping("/{id}")
    public ApiResponse<FileScanResult> getById(@PathVariable UUID id, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        return fileScanService.getById(id, tenantId)
                .map(ApiResponse::success)
                .orElse(ApiResponse.error("Scan result not found"));
    }

    @PostMapping("/{id}/release")
    public ApiResponse<FileScanResult> release(@PathVariable UUID id, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        String releasedBy = TenantContext.getUserEmail();
        return fileScanService.release(id, tenantId, releasedBy)
                .map(ApiResponse::success)
                .orElse(ApiResponse.error("Scan result not found"));
    }
}
