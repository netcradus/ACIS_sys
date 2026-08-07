package com.netcradus.acis.log.controller;

import com.netcradus.acis.log.model.LogDocument;
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
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@Slf4j
@RestController
@RequestMapping("/api/logs")
@RequiredArgsConstructor
public class LogController {

    private final LogRepository logRepository;

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

    @PostMapping("/translate")
    public ResponseEntity<Map> translateToSpl(@RequestBody Map<String, String> payload) {
        String query = payload.get("query");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, String>> request = new HttpEntity<>(Map.of("query", query), headers);
        
        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(aiServiceUrl + "/ai/query", request, Map.class);
            return ResponseEntity.status(response.getStatusCode())
                                 .headers(response.getHeaders())
                                 .body(response.getBody());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/ai-health")
    public ResponseEntity<Map<String, String>> checkAiHealth() {
        try {
            Map response = restTemplate.getForObject(aiServiceUrl + "/ai/health", Map.class);
            if (response != null && "ok".equals(response.get("status"))) {
                return ResponseEntity.ok(Map.of("status", "UP"));
            }
            return ResponseEntity.ok(Map.of("status", "DOWN"));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("status", "DOWN"));
        }
    }
}
