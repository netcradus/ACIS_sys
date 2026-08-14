package com.netcradus.acis.ingestion.controller;

import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.ingestion.service.IngestionErrorService;
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
    private final IngestionErrorService ingestionErrorService;
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
        try {
            kafkaTemplate.send(TOPIC, logDoc);
        } catch (Exception e) {
            log.warn("Failed to publish syslog event for tenant {}: {}", TenantContext.getTenantId(), e.getMessage());
            ingestionErrorService.record(service, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("status", "failed"));
        }
        return ResponseEntity.accepted().body(Map.of("status", "accepted"));
    }

    private ResponseEntity<Map<String, String>> doIngestJson(List<Map<String, Object>> logs) {
        log.debug("Received {} JSON logs", logs.size());
        String tenantId = TenantContext.getTenantId();
        int published = 0;
        for (Map<String, Object> logDoc : logs) {
            logDoc.put("tenantId", tenantId);
            if (!logDoc.containsKey("timestamp")) {
                logDoc.put("timestamp", java.time.Instant.now().toString());
            }
            try {
                kafkaTemplate.send(TOPIC, logDoc);
                published++;
            } catch (Exception e) {
                log.warn("Failed to publish JSON log event for tenant {}: {}", tenantId, e.getMessage());
                ingestionErrorService.record("json_ingest", e.getMessage());
            }
        }
        return ResponseEntity.accepted().body(Map.of("status", "accepted", "count", String.valueOf(published)));
    }
}
