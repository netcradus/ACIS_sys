package com.netcradus.acis.ingestion.controller;

import com.netcradus.acis.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ingest")
@RequiredArgsConstructor
@Slf4j
public class IngestionController {

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private static final String TOPIC = "acis-logs";

    @PostMapping("/syslog")
    public ResponseEntity<Map<String, String>> ingestSyslog(@RequestBody String rawLog) {
        log.debug("Received syslog: {}", rawLog);
        // Simple normalization
        Map<String, Object> logDoc = new HashMap<>();
        logDoc.put("tenantId", TenantContext.getTenantId());
        logDoc.put("message", rawLog);
        logDoc.put("level", "INFO");
        logDoc.put("service", "syslog");
        logDoc.put("timestamp", java.time.Instant.now());
        kafkaTemplate.send(TOPIC, logDoc);
        return ResponseEntity.accepted().body(Map.of("status", "accepted"));
    }

    @PostMapping("/json")
    public ResponseEntity<Map<String, String>> ingestJson(@RequestBody List<Map<String, Object>> logs) {
        log.debug("Received {} JSON logs", logs.size());
        String tenantId = TenantContext.getTenantId();
        for (Map<String, Object> logDoc : logs) {
            logDoc.put("tenantId", tenantId);
            if (!logDoc.containsKey("timestamp")) {
                logDoc.put("timestamp", java.time.Instant.now().toString());
            }
            kafkaTemplate.send(TOPIC, logDoc);
        }
        return ResponseEntity.accepted().body(Map.of("status", "accepted", "count", String.valueOf(logs.size())));
    }
}
