package com.netcradus.acis.log.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * Real bug found in a live production test (a real IOC lookup for an
 * indicator confirmed present in the DB came back "not found"): these
 * calls never attached the X-Internal-Service-Key header that
 * asset-service/threat-service's own SecurityConfig requires for a
 * service-to-service caller with no end-user JWT (see
 * InternalServiceKeyMatcher's Javadoc — the same pattern already used
 * correctly elsewhere in this codebase, e.g. AssetDriftDetectionService).
 * Every call here was silently getting a 401, and onErrorResume's
 * log.debug("No ... found") swallowed it into an indistinguishable-from-
 * genuinely-absent message — enrichment has likely never actually worked
 * in production. X-Tenant-ID is also required: threat_indicators/assets
 * are tenant-scoped by RLS, and TenantContextFilter's internal-service
 * bypass path only sets TenantContext when this header is present.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class EnrichmentClient {

    private final WebClient webClient;

    @Value("${acis.internal-service-key}")
    private String internalServiceKey;

    private static final String INTERNAL_SERVICE_KEY_HEADER = "X-Internal-Service-Key";
    private static final String TENANT_HEADER = "X-Tenant-ID";

    /**
     * Look up asset information by IP address.
     */
    public Mono<Map<String, Object>> getAssetByIp(String ip, String tenantId) {
        return webClient.get()
                .uri("/api/assets/ip/{ip}", ip)
                .header(INTERNAL_SERVICE_KEY_HEADER, internalServiceKey)
                .header(TENANT_HEADER, tenantId)
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
    public Mono<Map<String, Object>> getThreatIntel(String value, String tenantId) {
        return webClient.get()
                .uri("/api/threat-intel/lookup/{value}", value)
                .header(INTERNAL_SERVICE_KEY_HEADER, internalServiceKey)
                .header(TENANT_HEADER, tenantId)
                .retrieve()
                .bodyToMono(Map.class)
                .map(map -> (Map<String, Object>) map)
                .onErrorResume(e -> {
                    log.debug("No threat intel found for value: {}", value);
                    return Mono.empty();
                });
    }
}
