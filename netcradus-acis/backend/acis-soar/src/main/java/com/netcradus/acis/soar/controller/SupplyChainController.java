package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.soar.model.DependencyFinding;
import com.netcradus.acis.soar.model.SecretFinding;
import com.netcradus.acis.soar.service.SupplyChainScanService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/**
 * Real supply-chain security under /api/soar/supply-chain - falls under the
 * existing catch-all "/api/soar" -> SOAR Playbooks RBAC mapping. Accepts a
 * manifest/file upload directly (pom.xml, package.json, or arbitrary source
 * text for secrets scanning) - there is no repository connector here (see
 * SupplyChainScanService's class doc for why).
 */
@RestController
@RequestMapping("/api/soar/supply-chain")
@RequiredArgsConstructor
public class SupplyChainController {

    private final SupplyChainScanService supplyChainScanService;

    @PostMapping("/scan-dependencies")
    public ApiResponse<SupplyChainScanService.DependencyScanResult> scanDependencies(
            @RequestParam("file") MultipartFile file, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        try {
            String content = new String(file.getBytes(), StandardCharsets.UTF_8);
            String name = file.getOriginalFilename() != null ? file.getOriginalFilename() : "manifest";
            return ApiResponse.success(supplyChainScanService.scanManifest(name, content, tenantId));
        } catch (Exception e) {
            return ApiResponse.error("Dependency scan failed: " + e.getMessage());
        }
    }

    @PostMapping("/scan-secrets")
    public ApiResponse<SupplyChainScanService.SecretScanResultDto> scanSecrets(
            @RequestParam("file") MultipartFile file, @RequestHeader("X-Tenant-ID") UUID tenantId) {
        try {
            String content = new String(file.getBytes(), StandardCharsets.UTF_8);
            String name = file.getOriginalFilename() != null ? file.getOriginalFilename() : "source";
            return ApiResponse.success(supplyChainScanService.scanForSecrets(name, content, tenantId));
        } catch (Exception e) {
            return ApiResponse.error("Secrets scan failed: " + e.getMessage());
        }
    }

    @GetMapping("/dependency-findings")
    public ApiResponse<List<DependencyFinding>> dependencyFindings(@RequestHeader("X-Tenant-ID") UUID tenantId) {
        return ApiResponse.success(supplyChainScanService.listDependencyFindings(tenantId));
    }

    @GetMapping("/secret-findings")
    public ApiResponse<List<SecretFinding>> secretFindings(@RequestHeader("X-Tenant-ID") UUID tenantId) {
        return ApiResponse.success(supplyChainScanService.listSecretFindings(tenantId));
    }
}
