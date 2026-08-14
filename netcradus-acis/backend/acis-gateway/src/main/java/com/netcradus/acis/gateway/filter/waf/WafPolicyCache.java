package com.netcradus.acis.gateway.filter.waf;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Real per-tenant WAF policy, polled from acis-soar's internal bulk endpoint
 * (GET /api/soar/waf/internal/all, gated by the shared X-Internal-Service-Key
 * — same mechanism IntegrationPollerService/AssetDriftDetectionService
 * already use for genuine service-to-service calls) rather than a synchronous
 * per-request DB round trip, which would put acis-soar's availability on the
 * critical path of every single gateway request. A brief staleness window
 * (up to policyPollIntervalMs) after an admin changes their policy is an
 * accepted tradeoff, same as RateLimiterFilter's window-based counting.
 *
 * Tenants absent from the cache (never configured, or acis-soar unreachable
 * on first poll) resolve to the safe default: BLOCK, nothing disabled.
 */
@Component
public class WafPolicyCache {

    private static final Logger log = LoggerFactory.getLogger(WafPolicyCache.class);

    public record PolicyView(String mode, java.util.List<String> disabledCategories) {}

    private static final PolicyView DEFAULT_POLICY = new PolicyView("BLOCK", java.util.List.of());

    private final WebClient webClient;
    private final ObjectMapper objectMapper;
    private final String internalServiceKey;
    private final String soarServiceUrl;

    private volatile Map<String, PolicyView> policiesByTenant = new ConcurrentHashMap<>();

    public WafPolicyCache(WebClient.Builder webClientBuilder, ObjectMapper objectMapper,
            @Value("${acis.internal-service-key}") String internalServiceKey,
            @Value("${acis.waf.soar-service-url}") String soarServiceUrl) {
        this.webClient = webClientBuilder.build();
        this.objectMapper = objectMapper;
        this.internalServiceKey = internalServiceKey;
        this.soarServiceUrl = soarServiceUrl;
    }

    public PolicyView policyFor(String tenantId) {
        if (tenantId == null) {
            return DEFAULT_POLICY;
        }
        return policiesByTenant.getOrDefault(tenantId, DEFAULT_POLICY);
    }

    @Scheduled(fixedDelayString = "${acis.waf.policy-poll-interval-ms:30000}", initialDelayString = "5000")
    public void refresh() {
        webClient.get()
                .uri(soarServiceUrl + "/api/soar/waf/internal/all")
                .header("X-Internal-Service-Key", internalServiceKey)
                .header(HttpHeaders.ACCEPT, "application/json")
                .retrieve()
                .bodyToMono(String.class)
                .doOnNext(this::applyRawResponse)
                .doOnError(e -> log.warn("WAF policy poll failed, keeping previous cache ({} tenants): {}",
                        policiesByTenant.size(), e.getMessage()))
                .onErrorResume(e -> reactor.core.publisher.Mono.empty())
                .subscribe();
    }

    private void applyRawResponse(String json) {
        try {
            Map<String, RawPolicy> raw = objectMapper.readValue(json, new TypeReference<Map<String, RawPolicy>>() {});
            Map<String, PolicyView> next = new ConcurrentHashMap<>();
            raw.forEach((tenantId, p) -> next.put(tenantId,
                    new PolicyView(p.mode, p.disabledCategories == null ? java.util.List.of() : p.disabledCategories)));
            policiesByTenant = next;
        } catch (Exception e) {
            log.warn("Failed to parse WAF policy response, keeping previous cache: {}", e.getMessage());
        }
    }

    /** Mirrors WafPolicyService.PolicyView's JSON shape on the acis-soar side. */
    private static class RawPolicy {
        public String mode;
        public java.util.List<String> disabledCategories;
    }

    public boolean isCategoryDisabled(String tenantId, WafCategory category) {
        PolicyView policy = policyFor(tenantId);
        return policy.disabledCategories() != null
                && policy.disabledCategories().contains(category.name());
    }
}
