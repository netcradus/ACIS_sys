package com.netcradus.acis.log.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * Two real bugs found in a live production test (a real IOC lookup for an
 * indicator confirmed present in the DB came back "not found"):
 *
 * 1. These calls never attached the X-Internal-Service-Key header that
 * asset-service/threat-service's own SecurityConfig requires for a
 * service-to-service caller with no end-user JWT (see
 * InternalServiceKeyMatcher's Javadoc). X-Tenant-ID is also required —
 * threat_indicators/assets are tenant-scoped by RLS, and
 * TenantContextFilter's internal-service bypass path only sets
 * TenantContext when this header is present.
 *
 * 2. Fixing (1) alone still 401'd: the injected WebClient (see
 * WebClientConfig) is routed through acis-gateway (baseUrl =
 * acis.gateway.url), and the gateway's own SecurityConfig has no concept
 * of X-Internal-Service-Key at all — .anyExchange().authenticated()
 * catches everything not on its explicit permitAll list, so the gateway
 * rejected these calls before they ever reached asset-service/
 * threat-service's own permissive config. Every other real internal
 * service-to-service caller in this codebase (e.g.
 * AssetDriftDetectionService's acis.alerts-service.url) calls its target
 * directly instead, bypassing the gateway entirely — these calls now do
 * the same, using absolute URLs that override the injected WebClient's
 * base URL.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class EnrichmentClient {

    private final WebClient webClient;

    @Value("${acis.internal-service-key}")
    private String internalServiceKey;

    @Value("${acis.asset-service.url}")
    private String assetServiceUrl;

    @Value("${acis.threat-service.url}")
    private String threatServiceUrl;

    private static final String INTERNAL_SERVICE_KEY_HEADER = "X-Internal-Service-Key";
    private static final String TENANT_HEADER = "X-Tenant-ID";

    /**
     * Look up asset information by IP address.
     */
    public Mono<Map<String, Object>> getAssetByIp(String ip, String tenantId) {
        return webClient.get()
                .uri(assetServiceUrl + "/api/assets/ip/{ip}", ip)
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
                .uri(threatServiceUrl + "/api/threat-intel/lookup/{value}", value)
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
