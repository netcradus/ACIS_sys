package com.netcradus.acis.asset.service;

import com.netcradus.acis.asset.model.Asset;
import com.netcradus.acis.asset.repository.AssetRepository;
import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

/**
 * Real automatic drift detection powering "Endpoints & Network —
 * Self-Healing": periodically cross-checks every tenant's real open
 * CRITICAL/HIGH alerts (via the same RestTemplate + X-Tenant-ID pattern
 * ComplianceService already uses) against the asset inventory, and flags an
 * asset DEGRADED when a real alert correlates to it — replacing what used
 * to be a health field nothing in the system ever actually set. Correlation
 * mirrors the frontend's Open Alerts panel: asset name in the alert title,
 * or asset IP inside the alert's parsed raw event.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AssetDriftDetectionService {

    private final AssetRepository assetRepository;
    private final AuditEventPublisher auditEventPublisher;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${acis.alerts-service.url}")
    private String alertsServiceUrl;

    @Value("${acis.internal-service-key}")
    private String internalServiceKey;

    @Scheduled(fixedRateString = "${acis.drift-detection-interval-ms:300000}", initialDelay = 60000)
    public void detectDrift() {
        for (String tenantId : findDistinctTenantIds()) {
            try {
                detectDriftForTenant(tenantId);
            } catch (Exception e) {
                log.warn("Drift detection failed for tenant {}: {}", tenantId, e.getMessage());
            }
        }
    }

    /**
     * Reads across all tenants — this scheduled sweep has no request/JWT of
     * its own, so without this bypass RLS (which FORCEs even the table-owning
     * connection role) would silently return zero tenants and the whole
     * sweep would never run for anyone. See RlsConfig.enableAssetsRowLevelSecurity.
     */
    private List<String> findDistinctTenantIds() {
        TenantContext.setSystemPollerInProgress(true);
        try {
            return assetRepository.findDistinctTenantIds();
        } finally {
            TenantContext.setSystemPollerInProgress(false);
        }
    }

    @SuppressWarnings("unchecked")
    private void detectDriftForTenant(String tenantId) {
        List<Map<String, Object>> alerts;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Tenant-ID", tenantId);
            headers.set("X-Internal-Service-Key", internalServiceKey);
            ResponseEntity<List> response = restTemplate.exchange(
                    alertsServiceUrl + "/api/alerts", HttpMethod.GET, new HttpEntity<>(headers), List.class);
            alerts = response.getBody();
        } catch (RuntimeException e) {
            // Honest skip, not a fabricated result — matches ComplianceService's
            // fetchAssetManagementSignal pattern for an unreachable dependency.
            log.warn("Could not reach alerts service for drift detection (tenant {}): {}", tenantId, e.getMessage());
            return;
        }
        if (alerts == null || alerts.isEmpty()) {
            return;
        }

        List<Map<String, Object>> activeHighSeverity = alerts.stream()
                .filter(this::isActiveHighSeverity)
                .toList();
        if (activeHighSeverity.isEmpty()) {
            return;
        }

        // This sweep's own local queries (findByTenantId/save) are subject to
        // the same RLS as everything else — the scheduled thread has no
        // tenant context until set explicitly here, mirroring
        // IntegrationPollerService's per-tenant TenantContext.setTenantId pattern.
        TenantContext.setTenantId(tenantId);
        try {
            for (Asset asset : assetRepository.findByTenantId(tenantId)) {
                if (!"OK".equalsIgnoreCase(asset.getHealth()) || Boolean.TRUE.equals(asset.getIsolationStatus())) {
                    continue;
                }
                boolean correlated = activeHighSeverity.stream().anyMatch(alert -> correlates(asset, alert));
                if (correlated) {
                    asset.setHealth("DEGRADED");
                    assetRepository.save(asset);
                    auditEventPublisher.publish("ASSET_DRIFT_DETECTED", "asset/" + asset.getId(),
                            "marked DEGRADED: correlated with an active high-severity alert");
                }
            }
        } finally {
            TenantContext.clear();
        }
    }

    private boolean isActiveHighSeverity(Map<String, Object> alert) {
        String severity = String.valueOf(alert.get("severity")).toUpperCase();
        String status = String.valueOf(alert.get("status")).toUpperCase();
        boolean highSeverity = severity.equals("CRITICAL") || severity.equals("HIGH");
        boolean active = !status.equals("CLOSED") && !status.equals("MITIGATED");
        return highSeverity && active;
    }

    private boolean correlates(Asset asset, Map<String, Object> alert) {
        String title = String.valueOf(alert.getOrDefault("title", "")).toLowerCase();
        if (asset.getName() != null && !asset.getName().isBlank() && title.contains(asset.getName().toLowerCase())) {
            return true;
        }
        Object rawEvent = alert.get("rawEvent");
        if (rawEvent == null || asset.getIpAddress() == null || asset.getIpAddress().isBlank()) {
            return false;
        }
        return String.valueOf(rawEvent).contains(asset.getIpAddress());
    }
}
