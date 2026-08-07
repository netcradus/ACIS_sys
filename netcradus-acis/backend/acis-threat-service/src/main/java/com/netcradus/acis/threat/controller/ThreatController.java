package com.netcradus.acis.threat.controller;

import com.netcradus.acis.threat.model.ThreatIndicator;
import com.netcradus.acis.threat.model.ThreatSeverity;
import com.netcradus.acis.threat.service.ThreatIntelligenceGrpcClient;
import com.netcradus.acis.threat.service.ThreatIntelligenceService;
import com.netcradus.acis.ai.grpc.EnrichIocResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

import java.util.List;

@RestController
@RequestMapping("/api/threat-intel")
@RequiredArgsConstructor
public class ThreatController {

    private final ThreatIntelligenceService threatService;

    @GetMapping
    public ResponseEntity<List<ThreatIndicator>> getAllIndicators(@RequestHeader("X-Tenant-ID") String tenantId) {
        return ResponseEntity.ok(threatService.findAll(tenantId));
    }

    @GetMapping("/lookup/{value}")
    public ResponseEntity<ThreatIndicator> lookupIndicator(@PathVariable String value, @RequestHeader("X-Tenant-ID") String tenantId) {
        return threatService.findByValue(value, tenantId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    private final ThreatIntelligenceGrpcClient grpcClient;

    @PostMapping("/enrich")
    public ResponseEntity<Map<String, Object>> enrichIndicator(@RequestBody Map<String, String> payload,
            @RequestHeader("X-Tenant-ID") String tenantId) {
        String indicator = payload.get("indicator");
        String type = payload.getOrDefault("type", "UNKNOWN");
        EnrichIocResponse response = grpcClient.enrich(indicator, type);

        ThreatSeverity severity = severityFromScore(response.getThreatScore());
        // Real enrichment results are now actually persisted — confirmed
        // live this session that a user-triggered VirusTotal/AbuseIPDB
        // lookup was previously computed and then thrown away, never
        // appearing anywhere in the indicator list.
        threatService.saveEnrichmentResult(tenantId, indicator, type, severity,
                response.getDescription(), "VirusTotal+AbuseIPDB");

        return ResponseEntity.ok(Map.of(
            "indicator", response.getIndicator(),
            "threat_score", response.getThreatScore(),
            "severity", severity.name(),
            "categories", response.getCategoriesList(),
            "description", response.getDescription()
        ));
    }

    private ThreatSeverity severityFromScore(int score) {
        if (score >= 75) return ThreatSeverity.CRITICAL;
        if (score >= 50) return ThreatSeverity.HIGH;
        if (score >= 20) return ThreatSeverity.MEDIUM;
        return ThreatSeverity.LOW;
    }

    public record IndicatorIngestRequest(String value, String type, String severity, String description, String source) {}

    /**
     * Real bulk ingestion path for IoCs already identified by an upstream
     * source (AWS GuardDuty findings, Azure AD risky sign-ins — see
     * IntegrationPollerService.extractAndForwardIndicators) — these already
     * carry a real severity/description from the vendor, so this skips the
     * VirusTotal/AbuseIPDB round-trip /enrich does and persists directly.
     */
    @PostMapping("/indicators/bulk")
    public ResponseEntity<Map<String, Object>> ingestIndicators(@RequestBody List<IndicatorIngestRequest> indicators,
            @RequestHeader("X-Tenant-ID") String tenantId) {
        int saved = 0;
        for (IndicatorIngestRequest req : indicators) {
            if (req.value() == null || req.value().isBlank()) continue;
            ThreatSeverity severity;
            try {
                severity = ThreatSeverity.valueOf(req.severity() != null ? req.severity().toUpperCase() : "LOW");
            } catch (IllegalArgumentException e) {
                severity = ThreatSeverity.LOW;
            }
            threatService.saveEnrichmentResult(tenantId, req.value(), req.type(), severity, req.description(), req.source());
            saved++;
        }
        return ResponseEntity.ok(Map.of("saved", saved));
    }
}
