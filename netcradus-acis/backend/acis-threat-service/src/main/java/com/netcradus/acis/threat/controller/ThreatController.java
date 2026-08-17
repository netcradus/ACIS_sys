package com.netcradus.acis.threat.controller;

import com.netcradus.acis.common.dto.PageResponse;
import com.netcradus.acis.threat.model.ThreatIndicator;
import com.netcradus.acis.threat.model.ThreatSeverity;
import com.netcradus.acis.threat.service.ThreatIntelligenceGrpcClient;
import com.netcradus.acis.threat.service.ThreatIntelligenceService;
import com.netcradus.acis.ai.grpc.EnrichIocResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

import java.util.List;

@RestController
@RequestMapping("/api/threat-intel")
@RequiredArgsConstructor
public class ThreatController {

    private static final int MAX_PAGE_SIZE = 500;

    private final ThreatIntelligenceService threatService;

    /**
     * Real database-level pagination (added during the production-readiness
     * audit - this endpoint previously returned a tenant's entire indicator
     * table unbounded). page/size default to the first 50 rows; size is
     * capped at 500 regardless of what's requested so a caller can't force
     * an effectively-unbounded fetch back in through the query string.
     */
    @GetMapping
    public ResponseEntity<PageResponse<ThreatIndicator>> getAllIndicators(
            @RequestHeader("X-Tenant-ID") String tenantId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        PageRequest pageRequest = PageRequest.of(Math.max(page, 0), safeSize, Sort.by(Sort.Direction.DESC, "lastSeen"));
        return ResponseEntity.ok(PageResponse.of(threatService.findAll(tenantId, pageRequest)));
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
        if (indicator == null || indicator.isBlank()) {
            // grpcClient.enrich would otherwise pass null into a protobuf
            // string field, which rejects null with an NPE that surfaced as
            // an uncaught 500 instead of a real 400 validation error.
            return ResponseEntity.badRequest().body(Map.of("error", "\"indicator\" is required"));
        }
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
        // Real fix for the N+1 here (see ThreatIntelligenceService.saveEnrichmentResultsBulk) -
        // one existence-check query + one batched saveAll() instead of a
        // findByValueAndTenantId + save() round trip per indicator.
        List<ThreatIntelligenceService.BulkIndicatorRequest> requests = indicators.stream()
                .map(req -> new ThreatIntelligenceService.BulkIndicatorRequest(
                        req.value(), req.type(), req.severity(), req.description(), req.source()))
                .toList();
        int saved = threatService.saveEnrichmentResultsBulk(tenantId, requests);
        return ResponseEntity.ok(Map.of("saved", saved));
    }
}
