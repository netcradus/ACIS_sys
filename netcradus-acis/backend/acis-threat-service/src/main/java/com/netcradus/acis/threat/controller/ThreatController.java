package com.netcradus.acis.threat.controller;

import com.netcradus.acis.threat.model.ThreatIndicator;
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
    public ResponseEntity<Map<String, Object>> enrichIndicator(@RequestBody Map<String, String> payload) {
        String indicator = payload.get("indicator");
        String type = payload.getOrDefault("type", "UNKNOWN");
        EnrichIocResponse response = grpcClient.enrich(indicator, type);
        
        return ResponseEntity.ok(Map.of(
            "indicator", response.getIndicator(),
            "threat_score", response.getThreatScore(),
            "categories", response.getCategoriesList(),
            "description", response.getDescription()
        ));
    }
}
