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
        return doIngestSyslog(rawLog, "syslog");
    }

    @PostMapping("/json")
    public ResponseEntity<Map<String, String>> ingestJson(@RequestBody List<Map<String, Object>> logs) {
        return doIngestJson(logs);
    }

    /**
     * Same shape as /syslog, reachable by a customer's own server with an API
     * key instead of a Keycloak JWT (see ApiKeyAuthFilter / acis-gateway's
     * SecurityConfig for the /api/ingest/external/** bypass). The "source"
     * field distinguishes API-key-authenticated traffic in the log record.
     */
    @PostMapping("/external/syslog")
    public ResponseEntity<Map<String, String>> ingestExternalSyslog(@RequestBody String rawLog) {
        return doIngestSyslog(rawLog, "external-syslog");
    }

    /** Same shape as /json, for API-key-authenticated external senders — see ingestExternalSyslog. */
    @PostMapping("/external/json")
    public ResponseEntity<Map<String, String>> ingestExternalJson(@RequestBody List<Map<String, Object>> logs) {
        return doIngestJson(logs);
    }

    private ResponseEntity<Map<String, String>> doIngestSyslog(String rawLog, String service) {
        log.debug("Received syslog: {}", rawLog);
        Map<String, Object> logDoc = new HashMap<>();
        logDoc.put("tenantId", TenantContext.getTenantId());
        logDoc.put("message", rawLog);
        logDoc.put("level", "INFO");
        logDoc.put("service", service);
        logDoc.put("timestamp", java.time.Instant.now());
        kafkaTemplate.send(TOPIC, logDoc);
        return ResponseEntity.accepted().body(Map.of("status", "accepted"));
    }

    private ResponseEntity<Map<String, String>> doIngestJson(List<Map<String, Object>> logs) {
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
