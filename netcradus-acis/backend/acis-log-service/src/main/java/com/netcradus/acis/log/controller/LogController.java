package com.netcradus.acis.log.controller;

import com.netcradus.acis.log.model.LogCategoryMapping;
import com.netcradus.acis.log.model.LogDocument;
import com.netcradus.acis.log.repository.LogCategoryMappingRepository;
import com.netcradus.acis.log.repository.LogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import lombok.extern.slf4j.Slf4j;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import com.fasterxml.jackson.databind.ObjectMapper;

@Slf4j
@RestController
@RequestMapping("/api/logs")
@RequiredArgsConstructor
public class LogController {

    private final LogRepository logRepository;
    private final com.netcradus.acis.log.service.IngestMetricsService ingestMetricsService;
    private final LogCategoryMappingRepository logCategoryMappingRepository;
    private final ObjectMapper objectMapper;

    private static final java.util.Set<String> VALID_LOG_CATEGORIES =
            java.util.Set.of("ENDPOINT", "NETWORK", "APPLICATION");

    @Value("${acis.ai-service.url}")
    private String aiServiceUrl;

    @GetMapping("/search")
    public Mono<List<LogDocument>> search(
            @RequestHeader("X-Tenant-ID") String tenantId,
            @RequestParam(required = false) String service,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String host,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        // Real per-tenant scoping — confirmed live this session that this
        // endpoint previously returned every tenant's logs regardless of
        // caller. X-Tenant-ID is always the JWT-derived real value here
        // (TenantContextFilter overrides whatever the client sent), never
        // client-supplied.
        List<LogDocument> allLogs;
        try {
            allLogs = logRepository.findByTenantId(tenantId);
        } catch (Exception e) {
            log.warn("Elasticsearch search failed, returning empty result: {}", e.getMessage());
            return Mono.just(Collections.emptyList());
        }

        Stream<LogDocument> stream = allLogs.stream();
        
        if (service != null && !service.trim().isEmpty() && !service.equalsIgnoreCase("ALL")) {
            stream = stream.filter(log -> service.equalsIgnoreCase(log.getService()));
        }
        if (level != null && !level.trim().isEmpty()) {
            stream = stream.filter(log -> level.equalsIgnoreCase(log.getLevel()));
        }
        if (host != null && !host.trim().isEmpty()) {
            stream = stream.filter(log -> host.equalsIgnoreCase(log.getHost()));
        }
        if (query != null && !query.trim().isEmpty()) {
            stream = stream.filter(log -> log.getMessage() != null && log.getMessage().toLowerCase().contains(query.toLowerCase()));
        }
        
        List<LogDocument> filtered = stream
                .sorted((a, b) -> {
                    if (a.getTimestamp() == null || b.getTimestamp() == null) return 0;
                    return b.getTimestamp().compareTo(a.getTimestamp());
                })
                .collect(Collectors.toList());

        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 500);
        int fromIndex = Math.min(safePage * safeSize, filtered.size());
        int toIndex = Math.min(fromIndex + safeSize, filtered.size());
        List<LogDocument> paged = filtered.subList(fromIndex, toIndex);

        return Mono.just(paged);
    }

    @GetMapping("/latest")
    public Flux<LogDocument> getLatest(@RequestHeader("X-Tenant-ID") String tenantId) {
        // Returns the most recent logs for real-time dashboard initial load
        try {
            return Flux.fromIterable(logRepository.findTop100ByTenantIdOrderByTimestampDesc(tenantId));
        } catch (Exception e) {
            log.warn("Elasticsearch search failed, returning empty result: {}", e.getMessage());
            return Flux.empty();
        }
    }

    private final RestTemplate restTemplate = new RestTemplate();

    /**
     * Best-effort parse of ai-service's real JSON error body (e.g.
     * {"success":false,"mode":"unavailable","error":"..."}) so it can be
     * forwarded as-is instead of being replaced with a generic message.
     */
    private Map<String, Object> parseAiErrorBody(String body) {
        try {
            return objectMapper.readValue(body, Map.class);
        } catch (Exception e) {
            return Map.of("success", false, "mode", "unavailable", "error", "AI service is temporarily unavailable");
        }
    }

    @PostMapping("/translate")
    public ResponseEntity<Map> translateToSpl(@RequestBody Map<String, String> payload) {
        String query = payload.get("query");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, String>> request = new HttpEntity<>(Map.of("query", query), headers);

        long startedAt = System.currentTimeMillis();
        log.info("AI_REQUEST_STARTED feature=query");
        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(aiServiceUrl + "/ai/query", request, Map.class);
            log.info("AI_REQUEST_SUCCESS feature=query durationMs={}", System.currentTimeMillis() - startedAt);
            return ResponseEntity.status(response.getStatusCode())
                                 .headers(response.getHeaders())
                                 .body(response.getBody());
        } catch (HttpStatusCodeException e) {
            // ai-service returned a real, structured "AI unavailable" error
            // — RestTemplate throws on any non-2xx, so this must be caught
            // explicitly and forwarded verbatim rather than collapsed into
            // a generic 500 by the catch-all below.
            log.warn("AI_REQUEST_FAILED feature=query status={} durationMs={}",
                    e.getStatusCode().value(), System.currentTimeMillis() - startedAt);
            return ResponseEntity.status(e.getStatusCode())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(parseAiErrorBody(e.getResponseBodyAsString()));
        } catch (Exception e) {
            log.warn("AI_REQUEST_FAILED feature=query error={} durationMs={}",
                    e.getClass().getSimpleName(), System.currentTimeMillis() - startedAt);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("success", false, "mode", "unavailable", "error", "AI service is temporarily unavailable"));
        }
    }

    /**
     * Real ingestion-pipeline telemetry for the Dashboard's system-health
     * panel — see IngestMetricsService. Not tenant-scoped (this is a
     * pipeline-wide health signal, not per-tenant data), so no
     * X-Tenant-ID dependency here.
     */
    /** Real tenant-configured service->category mappings — empty until an admin sets some, never a guessed default. */
    @GetMapping("/category-mappings")
    public ResponseEntity<List<Map<String, String>>> getCategoryMappings(@RequestHeader("X-Tenant-ID") String tenantId) {
        List<Map<String, String>> result = logCategoryMappingRepository.findByTenantId(tenantId).stream()
                .map(m -> Map.of("serviceName", m.getServiceName(), "category", m.getCategory()))
                .collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    /** Bulk upsert of real service->category mappings. Each entry: {serviceName, category}. category="" deletes the mapping (reverts that service to Uncategorized). */
    @PutMapping("/category-mappings")
    public ResponseEntity<?> putCategoryMappings(@RequestHeader("X-Tenant-ID") String tenantId,
                                                  @RequestBody List<Map<String, String>> mappings) {
        for (Map<String, String> entry : mappings) {
            String serviceName = entry.get("serviceName");
            String category = entry.get("category");
            if (serviceName == null || serviceName.isBlank()) {
                continue;
            }
            if (category == null || category.isBlank()) {
                logCategoryMappingRepository.findByTenantIdAndServiceName(tenantId, serviceName)
                        .ifPresent(logCategoryMappingRepository::delete);
                continue;
            }
            String normalized = category.trim().toUpperCase();
            if (!VALID_LOG_CATEGORIES.contains(normalized)) {
                return ResponseEntity.badRequest().body(Map.of(
                        "error", "Unknown category '" + category + "'. Must be one of: " + VALID_LOG_CATEGORIES));
            }
            LogCategoryMapping mapping = logCategoryMappingRepository
                    .findByTenantIdAndServiceName(tenantId, serviceName)
                    .orElseGet(LogCategoryMapping::new);
            mapping.setTenantId(tenantId);
            mapping.setServiceName(serviceName);
            mapping.setCategory(normalized);
            logCategoryMappingRepository.save(mapping);
        }
        return ResponseEntity.ok(Map.of("status", "saved"));
    }

    /**
     * Real, live event counts per category, computed from real log documents'
     * `service` field run through the tenant's real configured mapping — a
     * service with no mapping counts as "UNCATEGORIZED", never silently
     * dropped or guessed into one of the three real categories. Also returns
     * the real distinct service names seen (with their own real counts) so
     * the config UI can offer exactly what's actually flowing in, not an
     * invented list.
     */
    @GetMapping("/category-counts")
    public ResponseEntity<Map<String, Object>> getCategoryCounts(@RequestHeader("X-Tenant-ID") String tenantId) {
        List<LogDocument> logs;
        try {
            logs = logRepository.findByTenantId(tenantId);
        } catch (Exception e) {
            log.warn("Elasticsearch query failed for category-counts: {}", e.getMessage());
            logs = Collections.emptyList();
        }

        Map<String, String> serviceToCategory = logCategoryMappingRepository.findByTenantId(tenantId).stream()
                .collect(Collectors.toMap(LogCategoryMapping::getServiceName, LogCategoryMapping::getCategory));

        Map<String, Long> countsByService = logs.stream()
                .filter(l -> l.getService() != null && !l.getService().isBlank())
                .collect(Collectors.groupingBy(LogDocument::getService, Collectors.counting()));

        long endpointCount = 0, networkCount = 0, applicationCount = 0, uncategorizedCount = 0;
        List<Map<String, Object>> serviceBreakdown = new java.util.ArrayList<>();
        for (Map.Entry<String, Long> entry : countsByService.entrySet()) {
            String category = serviceToCategory.getOrDefault(entry.getKey(), "UNCATEGORIZED");
            switch (category) {
                case "ENDPOINT" -> endpointCount += entry.getValue();
                case "NETWORK" -> networkCount += entry.getValue();
                case "APPLICATION" -> applicationCount += entry.getValue();
                default -> uncategorizedCount += entry.getValue();
            }
            Map<String, Object> row = new java.util.HashMap<>();
            row.put("serviceName", entry.getKey());
            row.put("count", entry.getValue());
            row.put("category", category);
            serviceBreakdown.add(row);
        }
        serviceBreakdown.sort((a, b) -> Long.compare((Long) b.get("count"), (Long) a.get("count")));

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("endpoint", endpointCount);
        result.put("network", networkCount);
        result.put("application", applicationCount);
        result.put("uncategorized", uncategorizedCount);
        result.put("totalEvents", logs.size());
        result.put("services", serviceBreakdown);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/ingest-stats")
    public ResponseEntity<Map<String, Object>> getIngestStats() {
        return ResponseEntity.ok(Map.of(
                "lagSeriesMs", ingestMetricsService.getLagSeries(),
                "cpuUsagePercent", ingestMetricsService.getCpuUsagePercent()
        ));
    }

    /**
     * Real AI provider-chain metrics (request volume, success rate, latency,
     * provider breakdown) proxied from ai-service — see AIMetricsTracker there.
     * Not tenant-scoped: the LLM gateway is shared across tenants.
     */
    @GetMapping("/ai-metrics")
    public ResponseEntity<Map> getAiMetrics() {
        try {
            Map response = restTemplate.getForObject(aiServiceUrl + "/ai/metrics", Map.class);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.warn("Failed to fetch AI metrics: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("success", false, "error", "AI metrics unavailable"));
        }
    }

    /**
     * Real-time classifier retraining pipeline status, proxied from
     * ai-service (see training.py) — current deployed version and its real
     * held-out evaluation metrics, whether a training run is in progress,
     * and real version history. Not tenant-scoped: the classifier is one
     * shared global model.
     */
    @GetMapping("/ai-model-status")
    public ResponseEntity<Map> getAiModelStatus() {
        try {
            Map response = restTemplate.getForObject(aiServiceUrl + "/ai/model-status", Map.class);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.warn("Failed to fetch AI model status: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("success", false, "error", "AI model status unavailable"));
        }
    }

    /** Manual retrain trigger — real training run against real analyst-confirmed labels, not a simulated one. */
    @PostMapping("/ai-retrain")
    public ResponseEntity<Map> triggerAiRetrain() {
        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(aiServiceUrl + "/ai/retrain", null, Map.class);
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (HttpStatusCodeException e) {
            return ResponseEntity.status(e.getStatusCode())
                    .body(parseAiErrorBody(e.getResponseBodyAsString()));
        } catch (Exception e) {
            log.warn("Failed to trigger AI retrain: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("success", false, "error", "Could not reach AI service"));
        }
    }

    /** Rolls the live classifier back to a specific real prior trained version. */
    @PostMapping("/ai-model-rollback")
    public ResponseEntity<Map> rollbackAiModel(@RequestBody Map<String, String> body) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> request = new HttpEntity<>(Map.of("version_id", body.get("versionId")), headers);
            ResponseEntity<Map> response = restTemplate.postForEntity(aiServiceUrl + "/ai/model/rollback", request, Map.class);
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (HttpStatusCodeException e) {
            return ResponseEntity.status(e.getStatusCode())
                    .body(parseAiErrorBody(e.getResponseBodyAsString()));
        } catch (Exception e) {
            log.warn("Failed to roll back AI model: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("success", false, "error", "Could not reach AI service"));
        }
    }

    @GetMapping("/ai-health")
    public ResponseEntity<Map<String, String>> checkAiHealth() {
        try {
            Map response = restTemplate.getForObject(aiServiceUrl + "/ai/health", Map.class);
            // "status":"ok" only means the ai-service process is reachable
            // — it says nothing about whether an LLM feature can actually
            // produce a real response. "llmProviderConfigured" (from
            // ai-service's own provider chain) is what the frontend's "AI
            // Agent Ready"/"Offline" pill should really reflect, so this
            // never reports Ready when every real provider is unconfigured.
            boolean serviceUp = response != null && "ok".equals(response.get("status"));
            boolean llmConfigured = serviceUp && Boolean.TRUE.equals(response.get("llm_provider_configured"));
            return ResponseEntity.ok(Map.of("status", llmConfigured ? "UP" : "DOWN"));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("status", "DOWN"));
        }
    }
}
