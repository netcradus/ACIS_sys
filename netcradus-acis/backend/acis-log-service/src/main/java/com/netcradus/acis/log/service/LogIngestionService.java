package com.netcradus.acis.log.service;

import com.netcradus.acis.log.model.LogDocument;
import com.netcradus.acis.log.repository.LogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Slf4j
@Service
@RequiredArgsConstructor
public class LogIngestionService {

    // Matches the tenant_id attribute seeded on the demo Keycloak users in
    // infra/keycloak/realm-acis.json. Used only as a last-resort fallback for
    // legacy/demo messages that predate the tenantId field on LogDocument.
    private static final String DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";

    private final LogRepository logRepository;
    private final org.springframework.messaging.simp.SimpMessagingTemplate messagingTemplate;
    private final com.netcradus.acis.log.client.EnrichmentClient enrichmentClient;
    private final org.springframework.kafka.core.KafkaTemplate<String, Object> kafkaTemplate;
    private final IngestMetricsService ingestMetricsService;
    private final IngestionErrorService ingestionErrorService;

    @KafkaListener(topics = "acis-logs", groupId = "${spring.kafka.consumer.group-id}")
    public void consume(LogDocument logDocument) {
        log.debug("Ingesting log: {}", logDocument.getMessage());
        
        // Ensure timestamp is set if not provided
        if (logDocument.getTimestamp() == null) {
            logDocument.setTimestamp(Instant.now());
        }

        // --- Phase 3: Dynamic Enrichment ---
        try {
            String ip = extractIp(logDocument);
            if (ip != null) {
                // Enrich with Asset Data
                enrichmentClient.getAssetByIp(ip)
                    .doOnNext(asset -> {
                        logDocument.setAssetName((String) asset.get("name"));
                        logDocument.setAssetType((String) asset.get("type"));
                    })
                    .block(java.time.Duration.ofMillis(500)); // Short timeout for safety

                // Enrich with Threat Intel
                enrichmentClient.getThreatIntel(ip)
                    .doOnNext(threat -> {
                        logDocument.setThreatSeverity((String) threat.get("severity"));
                        logDocument.setThreatSource((String) threat.get("source"));
                    })
                    .block(java.time.Duration.ofMillis(500));
            }
        } catch (Exception e) {
            log.warn("Enrichment failed (continuing with raw log): {}", e.getMessage());
            ingestionErrorService.record("enrichment", e.getMessage());
        }

        // Try to persist to Elasticsearch (non-fatal if ES is down)
        try {
            logRepository.save(logDocument);
        } catch (Exception e) {
            log.warn("Failed to save log to Elasticsearch: {}", e.getMessage());
            ingestionErrorService.record("es_persist", e.getMessage());
        }
        
        // Always broadcast to WebSocket for real-time UI
        messagingTemplate.convertAndSend("/topic/logs", logDocument);

        // Real end-to-end pipeline lag (ingest-receipt -> fully processed,
        // including the enrichment calls above) — feeds the Dashboard's
        // ingest-lag sparkline. See IngestMetricsService.
        ingestMetricsService.recordLag(logDocument.getTimestamp());

        // --- Publish to acis.raw.events for Correlation Engine ---
        String tenantId = logDocument.getTenantId() != null ? logDocument.getTenantId() : DEMO_TENANT_ID;
        com.netcradus.acis.common.dto.NormalizedEvent normalizedEvent = com.netcradus.acis.common.dto.NormalizedEvent.builder()
            .eventId(logDocument.getId())
            .tenantId(tenantId)
            // Real source-event time (when the log itself says it happened),
            // not ingest-processing time - this is what MTTD is measured
            // from once an alert fires. logDocument.getTimestamp() is never
            // null here (defaulted at line 34 above if the source omitted it).
            .timestamp(java.time.LocalDateTime.ofInstant(logDocument.getTimestamp(), java.time.ZoneOffset.UTC))
            .sourceType(logDocument.getService())
            .raw(logDocument.getMessage())
            .severity(logDocument.getLevel())
            .build();

        if (logDocument.getMessage() != null && logDocument.getMessage().toLowerCase().contains("login")) {
            normalizedEvent.setAction("login_failed");
        } else if (logDocument.getMessage() != null && logDocument.getMessage().toLowerCase().contains("suspicious")) {
            normalizedEvent.setAction("suspicious_activity");
        }

        kafkaTemplate.send("acis.raw.events", normalizedEvent);
    }

    /**
     * Helper to find an IP address in the log message or metadata.
     */
    private String extractIp(LogDocument doc) {
        // First check metadata for an explicit IP field
        if (doc.getMetadata() != null && doc.getMetadata().containsKey("ip")) {
            return String.valueOf(doc.getMetadata().get("ip"));
        }
        // Fallback: simple regex check in the message string for IPv4
        java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b");
        java.util.regex.Matcher matcher = pattern.matcher(doc.getMessage());
        if (matcher.find()) {
            return matcher.group();
        }
        return null;
    }

}
