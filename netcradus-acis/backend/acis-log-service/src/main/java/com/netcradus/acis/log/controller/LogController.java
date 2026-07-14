package com.netcradus.acis.log.controller;

import com.netcradus.acis.log.model.LogDocument;
import com.netcradus.acis.log.repository.LogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;
import java.util.stream.Stream;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@RestController
@RequestMapping("/api/logs")
@RequiredArgsConstructor
public class LogController {

    private final LogRepository logRepository;

    @GetMapping("/search")
    public Mono<List<LogDocument>> search(
            @RequestParam(required = false) String service,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String host,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        
        List<LogDocument> allLogs = StreamSupport.stream(logRepository.findAll().spliterator(), false)
                .collect(Collectors.toList());
                
        if (allLogs.isEmpty()) {
            allLogs = logRepository.findTop100ByOrderByTimestampDesc();
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
                
        return Mono.just(filtered);
    }

    @GetMapping("/latest")
    public Flux<LogDocument> getLatest() {
        // Returns the most recent logs for real-time dashboard initial load
        return Flux.fromIterable(logRepository.findTop100ByOrderByTimestampDesc());
    }

    private final RestTemplate restTemplate = new RestTemplate();

    @PostMapping("/translate")
    public ResponseEntity<Map> translateToSpl(@RequestBody Map<String, String> payload) {
        String query = payload.get("query");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, String>> request = new HttpEntity<>(Map.of("query", query), headers);
        
        try {
            ResponseEntity<Map> response = restTemplate.postForEntity("http://localhost:8090/ai/query", request, Map.class);
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
            Map response = restTemplate.getForObject("http://localhost:8090/ai/health", Map.class);
            if (response != null && "ok".equals(response.get("status"))) {
                return ResponseEntity.ok(Map.of("status", "UP"));
            }
            return ResponseEntity.ok(Map.of("status", "DOWN"));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("status", "DOWN"));
        }
    }
}
