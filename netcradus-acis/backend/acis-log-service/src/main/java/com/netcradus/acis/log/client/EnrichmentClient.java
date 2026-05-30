package com.netcradus.acis.log.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class EnrichmentClient {

    private final WebClient webClient;

    /**
     * Look up asset information by IP address.
     */
    public Mono<Map<String, Object>> getAssetByIp(String ip) {
        return webClient.get()
                .uri("/api/assets/ip/{ip}", ip)
                .retrieve()
                .bodyToMono(Map.class)
                .map(map -> (Map<String, Object>) map)
                .onErrorResume(e -> {
                    log.debug("No asset found for IP: {}", ip);
                    return Mono.empty();
                });
    }

    /**
     * Look up threat intelligence for a given indicator value (e.g., IP, Domain).
     */
    public Mono<Map<String, Object>> getThreatIntel(String value) {
        return webClient.get()
                .uri("/api/threat-intel/lookup/{value}", value)
                .retrieve()
                .bodyToMono(Map.class)
                .map(map -> (Map<String, Object>) map)
                .onErrorResume(e -> {
                    log.debug("No threat intel found for value: {}", value);
                    return Mono.empty();
                });
    }
}
