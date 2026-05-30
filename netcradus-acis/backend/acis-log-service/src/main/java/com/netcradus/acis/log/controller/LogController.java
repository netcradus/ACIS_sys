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
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        
        // Simple search logic for Phase 2 MVP
        if (service != null) {
            return Mono.just(logRepository.findByServiceOrderByTimestampDesc(service));
        } else if (level != null) {
            return Mono.just(logRepository.findByLevelOrderByTimestampDesc(level));
        } else {
            return Mono.just(StreamSupport.stream(logRepository.findAll().spliterator(), false)
                    .collect(Collectors.toList()));
        }
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
}
