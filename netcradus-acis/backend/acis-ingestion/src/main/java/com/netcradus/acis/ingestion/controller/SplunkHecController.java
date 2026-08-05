package com.netcradus.acis.ingestion.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.MappingIterator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * A real Splunk HTTP Event Collector (HEC)-compatible receiver — lets an
 * actual Splunk universal/heavy forwarder configured with an HEC output
 * point directly at ACIS with zero changes on the Splunk side, since it
 * speaks Splunk's real wire protocol rather than ACIS's own JSON-array
 * convention. Authenticated by ApiKeyAuthFilter, which recognizes this
 * path's "Authorization: Splunk <token>" header against the same api_keys
 * table every other ACIS API key lives in.
 *
 * Splunk's real event format allows multiple JSON documents concatenated in
 * a single POST body with no enclosing array or separating commas — Jackson's
 * MappingIterator handles that natively via readValues() over one string.
 */
@Slf4j
@RestController
@RequestMapping("/services/collector")
@RequiredArgsConstructor
public class SplunkHecController {

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private static final String TOPIC = "acis-logs";

    @PostMapping({"", "/event"})
    public ResponseEntity<Map<String, Object>> ingestEvent(@RequestBody String body) {
        String tenantId = TenantContext.getTenantId();
        int count = 0;
        try {
            MappingIterator<JsonNode> docs = objectMapper.readerFor(JsonNode.class).readValues(body);
            while (docs.hasNextValue()) {
                JsonNode doc = docs.nextValue();
                Map<String, Object> logDoc = new HashMap<>();
                logDoc.put("tenantId", tenantId);
                logDoc.put("message", doc.has("event") ? doc.get("event").asText(doc.get("event").toString()) : doc.toString());
                logDoc.put("level", "INFO");
                logDoc.put("service", "splunk-hec");
                if (doc.has("host")) logDoc.put("host", doc.get("host").asText());
                if (doc.has("source")) logDoc.put("splunkSource", doc.get("source").asText());
                if (doc.has("sourcetype")) logDoc.put("sourcetype", doc.get("sourcetype").asText());
                if (doc.has("index")) logDoc.put("index", doc.get("index").asText());
                logDoc.put("timestamp", doc.has("time")
                        ? Instant.ofEpochSecond(doc.get("time").asLong()).toString()
                        : Instant.now().toString());
                kafkaTemplate.send(TOPIC, logDoc);
                count++;
            }
        } catch (Exception e) {
            log.warn("Malformed HEC event payload for tenant {}: {}", tenantId, e.getMessage());
            return ResponseEntity.badRequest().body(Map.of("text", "Invalid data format", "code", 6));
        }
        if (count == 0) {
            return ResponseEntity.badRequest().body(Map.of("text", "No data", "code", 5));
        }
        return ResponseEntity.ok(Map.of("text", "Success", "code", 0));
    }

    @PostMapping("/raw")
    public ResponseEntity<Map<String, Object>> ingestRaw(@RequestBody String body) {
        String tenantId = TenantContext.getTenantId();
        if (body == null || body.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("text", "No data", "code", 5));
        }
        Map<String, Object> logDoc = new HashMap<>();
        logDoc.put("tenantId", tenantId);
        logDoc.put("message", body);
        logDoc.put("level", "INFO");
        logDoc.put("service", "splunk-hec-raw");
        logDoc.put("timestamp", Instant.now().toString());
        kafkaTemplate.send(TOPIC, logDoc);
        return ResponseEntity.ok(Map.of("text", "Success", "code", 0));
    }
}
