package com.netcradus.acis.alerts.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.alerts.model.Alert;
import com.netcradus.acis.alerts.repository.AlertRepository;
import com.netcradus.acis.alerts.service.AlertService;
import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.AlertDto;
import com.netcradus.acis.common.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Slf4j
@RestController
@RequestMapping("/api/alerts")
@RequiredArgsConstructor
public class AlertController {

    private final AlertService alertService;
    private final AlertRepository alertRepository;
    private final AuditEventPublisher auditEventPublisher;
    private final ObjectMapper objectMapper;

    @Value("${acis.ai-service.url}")
    private String aiServiceUrl;

    @Value("${acis.internal-service-key}")
    private String internalServiceKey;

    @GetMapping
    public List<AlertDto> getAllAlerts(@RequestHeader("X-Tenant-ID") String tenantId) {
        return alertService.findAll(tenantId);
    }

    @GetMapping("/{id}")
    public Alert getAlertById(@PathVariable String id, @RequestHeader("X-Tenant-ID") String tenantId) {
        return alertRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Alert not found"));
    }

    @PutMapping("/{id}/status")
    public Alert updateStatus(@PathVariable String id, @RequestParam String status,
                               @RequestHeader("X-Tenant-ID") String tenantId) {
        Alert alert = alertRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Alert not found"));
        alert.setStatus(status);
        Alert saved = alertRepository.save(alert);
        auditEventPublisher.publish("ALERT_STATUS_CHANGE", "alert/" + id, "status=" + status);
        return saved;
    }

    /** Real classifier categories this system actually predicts — see ai-service's CLASSES list. Kept in sync manually since ai-service is a separate Python process with no shared enum. */
    private static final java.util.Set<String> VALID_CATEGORIES = java.util.Set.of(
            "malware", "exfiltration", "lateral_movement", "phishing", "privilege_escalation", "benign");

    @PutMapping("/{id}")
    public ResponseEntity<?> updateAlert(@PathVariable String id, @RequestBody Map<String, Object> updates,
                              @RequestHeader("X-Tenant-ID") String tenantId) {
        Alert alert = alertRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Alert not found"));
        if (updates.containsKey("status")) {
            alert.setStatus((String) updates.get("status"));
        }
        if (updates.containsKey("ownerId")) {
            alert.setOwnerId((String) updates.get("ownerId"));
        }
        if (updates.containsKey("confirmedCategory")) {
            Object raw = updates.get("confirmedCategory");
            String category = raw == null ? null : String.valueOf(raw).trim();
            if (category != null && !category.isEmpty()) {
                if (!VALID_CATEGORIES.contains(category)) {
                    return ResponseEntity.badRequest().body(Map.of(
                            "error", "Unknown category. Must be one of: " + VALID_CATEGORIES));
                }
                alert.setConfirmedCategory(category);
                alert.setLabeledAt(java.time.LocalDateTime.now());
                auditEventPublisher.publish("ALERT_LABELED", "alert/" + id, "confirmedCategory=" + category);
            } else {
                // Explicit un-label (client sent an empty value) — real
                // correction of a prior mistaken label, not a no-op.
                alert.setConfirmedCategory(null);
                alert.setLabeledAt(null);
            }
        }
        Alert saved = alertRepository.save(alert);
        auditEventPublisher.publish("ALERT_UPDATE", "alert/" + id, "updated");
        return ResponseEntity.ok(saved);
    }

    /**
     * Real labeled training data for the ML retraining pipeline — every
     * alert an analyst has explicitly confirmed a category for, across
     * every tenant (the classifier is one shared global model, not
     * per-tenant, so its training set must be too). Internal-service-key
     * only: this deliberately crosses tenant boundaries, which no
     * tenant-scoped JWT caller should ever be able to trigger.
     */
    @GetMapping("/labeled")
    public ResponseEntity<?> getLabeledAlerts(
            @RequestHeader(value = "X-Internal-Service-Key", required = false) String providedKey) {
        if (internalServiceKey == null || internalServiceKey.isBlank() || !internalServiceKey.equals(providedKey)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Internal endpoint"));
        }
        com.netcradus.acis.common.tenant.TenantContext.setSystemPollerInProgress(true);
        try {
            List<Alert> labeled = alertRepository.findByConfirmedCategoryIsNotNull();
            List<Map<String, Object>> result = labeled.stream()
                    .map(a -> {
                        // Flat "event" shape matching exactly what ai-service's
                        // extract_features() reads (action/raw/severity/bytes_out/
                        // failed_logins/...) - the alert's own rawEvent JSON, with
                        // the alert's authoritative severity merged in (the raw
                        // event itself may not carry one).
                        Map<String, Object> event = new LinkedHashMap<>();
                        if (a.getRawEvent() != null) {
                            try {
                                Object parsed = objectMapper.readValue(a.getRawEvent(), Map.class);
                                if (parsed instanceof Map) {
                                    event.putAll((Map<String, Object>) parsed);
                                }
                            } catch (Exception ignored) {
                                // Not parseable JSON - train on severity/title alone below.
                            }
                        }
                        event.putIfAbsent("severity", a.getSeverity());
                        event.putIfAbsent("action", a.getTitle());

                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("id", a.getId());
                        row.put("confirmedCategory", a.getConfirmedCategory());
                        row.put("labeledAt", a.getLabeledAt());
                        row.put("event", event);
                        return row;
                    })
                    .collect(java.util.stream.Collectors.toList());
            return ResponseEntity.ok(result);
        } finally {
            com.netcradus.acis.common.tenant.TenantContext.setSystemPollerInProgress(false);
        }
    }

    @GetMapping("/dashboard/summary")
    public Map<String, Object> getDashboardSummary(@RequestHeader("X-Tenant-ID") String tenantId) {
        Map<String, Object> summary = new HashMap<>();
        List<Alert> allAlerts = alertRepository.findAllByTenantId(tenantId);

        long critical = allAlerts.stream().filter(a -> "CRITICAL".equalsIgnoreCase(a.getSeverity())).count();
        long high = allAlerts.stream().filter(a -> "HIGH".equalsIgnoreCase(a.getSeverity())).count();
        long open = allAlerts.stream().filter(a -> "OPEN".equalsIgnoreCase(a.getStatus())).count();

        summary.put("totalAlerts", allAlerts.size());
        summary.put("criticalAlerts", critical);
        summary.put("highAlerts", high);
        summary.put("openIncidents", open);
        summary.put("events24h", null); // Set to null to indicate "Still in development" in frontend
        
        return summary;
    }

    private final RestTemplate restTemplate = new RestTemplate();
    // Plain JDK client (not RestTemplate) so the SSE relay below can consume
    // ai-service's streamed response line-by-line instead of buffering the
    // whole body — RestTemplate has no first-class streaming-read support.
    private final HttpClient sseHttpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            // Force HTTP/1.1 — the JDK client's default HTTP_2 policy sends
            // an "Upgrade: h2c" cleartext-upgrade header on plain http://
            // requests, which uvicorn (ai-service's ASGI server) doesn't
            // support and rejects with "Unsupported upgrade request" /
            // "Invalid HTTP request received", surfacing as a 422 here.
            .version(HttpClient.Version.HTTP_1_1)
            .build();

    /**
     * Builds the same {raw_alert: {...}} shape ai-service's AlertRequest
     * expects, from the tenant's own stored Alert record — real fields,
     * not whatever a caller feels like sending. rawEvent is stored as a
     * JSON string; embedded as a parsed object when possible so the LLM
     * sees structured data instead of a doubly-escaped string.
     */
    private Map<String, Object> buildRawAlertPayload(Alert alert) {
        Map<String, Object> rawAlert = new LinkedHashMap<>();
        rawAlert.put("id", alert.getId());
        rawAlert.put("title", alert.getTitle());
        rawAlert.put("severity", alert.getSeverity());
        rawAlert.put("source", alert.getSource());
        rawAlert.put("status", alert.getStatus());
        if (alert.getRawEvent() != null) {
            try {
                rawAlert.put("rawEvent", objectMapper.readValue(alert.getRawEvent(), Map.class));
            } catch (Exception e) {
                rawAlert.put("rawEvent", alert.getRawEvent());
            }
        }
        return rawAlert;
    }

    /**
     * Best-effort parse of ai-service's real JSON error body (e.g.
     * {"success":false,"mode":"unavailable","error":"..."}) into a Map so
     * it can be forwarded as-is rather than re-wrapped or replaced with a
     * generic message — the frontend needs the real reason, not a guess.
     */
    private Map<String, Object> parseAiErrorBody(String body) {
        try {
            return objectMapper.readValue(body, Map.class);
        } catch (Exception e) {
            return Map.of("success", false, "mode", "unavailable", "error", "AI service is temporarily unavailable");
        }
    }

    @PostMapping("/{id}/explain")
    public ResponseEntity<Map> explainAlert(@PathVariable String id, @RequestHeader("X-Tenant-ID") String tenantId) {
        Alert alert = alertRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Alert not found"));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(Map.of("raw_alert", buildRawAlertPayload(alert)), headers);

        long startedAt = System.currentTimeMillis();
        log.info("AI_REQUEST_STARTED feature=explain alertId={}", id);
        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(aiServiceUrl + "/ai/explain", request, Map.class);
            log.info("AI_REQUEST_SUCCESS feature=explain alertId={} durationMs={}", id, System.currentTimeMillis() - startedAt);
            return ResponseEntity.status(response.getStatusCode())
                                 .headers(response.getHeaders())
                                 .body(response.getBody());
        } catch (HttpStatusCodeException e) {
            // ai-service returned a real, structured "AI unavailable" error
            // (e.g. 503 not-configured, 502 provider failure) — RestTemplate
            // throws on any non-2xx, so this must be caught explicitly and
            // forwarded verbatim; a blanket catch(Exception) below would
            // otherwise collapse it into a generic 500 and lose the real
            // reason.
            log.warn("AI_REQUEST_FAILED feature=explain alertId={} status={} durationMs={}",
                    id, e.getStatusCode().value(), System.currentTimeMillis() - startedAt);
            return ResponseEntity.status(e.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(parseAiErrorBody(e.getResponseBodyAsString()));
        } catch (Exception e) {
            log.warn("AI_REQUEST_FAILED feature=explain alertId={} error={} durationMs={}",
                    id, e.getClass().getSimpleName(), System.currentTimeMillis() - startedAt);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("success", false, "mode", "unavailable", "error", "AI service is temporarily unavailable"));
        }
    }

    /**
     * SSE passthrough to ai-service's /ai/explain/stream — relays each
     * "data: ..." line to the browser as it arrives, so the real OpenRouter
     * completion appears token-by-token in the UI instead of only after the
     * whole thing finishes. Uses SseEmitter (plain Spring MVC, no WebFlux
     * dependency needed) fed from a background thread reading the JDK
     * HttpClient's streamed response line-by-line.
     */
    @GetMapping(value = "/{id}/explain/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter explainAlertStream(@PathVariable String id, @RequestHeader("X-Tenant-ID") String tenantId) {
        SseEmitter emitter = new SseEmitter(60_000L);
        Alert alert = alertRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Alert not found"));

        String body;
        try {
            body = objectMapper.writeValueAsString(Map.of("raw_alert", buildRawAlertPayload(alert)));
        } catch (Exception e) {
            emitter.completeWithError(e);
            return emitter;
        }

        long startedAt = System.currentTimeMillis();
        log.info("AI_STREAM_STARTED feature=explain_stream alertId={}", id);

        Thread.ofVirtual().start(() -> {
            try {
                HttpRequest httpRequest = HttpRequest.newBuilder()
                        .uri(URI.create(aiServiceUrl + "/ai/explain/stream"))
                        .header("Content-Type", "application/json")
                        .timeout(Duration.ofSeconds(45))
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                        .build();

                HttpResponse<java.io.InputStream> response = sseHttpClient.send(httpRequest, HttpResponse.BodyHandlers.ofInputStream());
                if (response.statusCode() != 200) {
                    // ai-service pre-flight-rejected the request (e.g. 503
                    // "no provider configured") before opening the SSE
                    // stream at all — forward its real JSON error body
                    // verbatim rather than a synthetic message.
                    String errorBody = new String(response.body().readAllBytes(), StandardCharsets.UTF_8);
                    log.warn("AI_STREAM_FAILED feature=explain_stream alertId={} status={} durationMs={}",
                            id, response.statusCode(), System.currentTimeMillis() - startedAt);
                    emitter.send(SseEmitter.event().data(
                            errorBody.isBlank()
                                    ? "{\"success\":false,\"mode\":\"unavailable\",\"error\":\"AI service is temporarily unavailable\"}"
                                    : errorBody));
                    emitter.complete();
                    return;
                }

                try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (line.startsWith("data:")) {
                            emitter.send(SseEmitter.event().data(line.substring("data:".length()).trim()));
                        }
                    }
                }
                log.info("AI_STREAM_COMPLETED feature=explain_stream alertId={} durationMs={}",
                        id, System.currentTimeMillis() - startedAt);
                emitter.complete();
            } catch (IOException | InterruptedException e) {
                log.warn("AI_STREAM_FAILED feature=explain_stream alertId={} error={} durationMs={}",
                        id, e.getClass().getSimpleName(), System.currentTimeMillis() - startedAt);
                emitter.completeWithError(e);
            } catch (Exception e) {
                log.warn("AI_STREAM_FAILED feature=explain_stream alertId={} error={} durationMs={}",
                        id, e.getClass().getSimpleName(), System.currentTimeMillis() - startedAt);
                emitter.completeWithError(e);
            }
        });

        emitter.onTimeout(emitter::complete);
        return emitter;
    }
}
