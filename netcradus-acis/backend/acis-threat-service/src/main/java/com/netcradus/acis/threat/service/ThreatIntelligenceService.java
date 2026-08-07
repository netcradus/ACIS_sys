package com.netcradus.acis.threat.service;

import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.threat.model.ThreatIndicator;
import com.netcradus.acis.threat.model.ThreatSeverity;
import com.netcradus.acis.threat.repository.ThreatIndicatorRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class ThreatIntelligenceService {

    // Matches the tenant_id attribute seeded on the demo Keycloak users in
    // infra/keycloak/realm-acis.json (admin/analyst1/analyst2). Used for seed/demo
    // indicators only — real indicators are always tagged with the enriching
    // caller's tenant, never this constant.
    private static final String DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";

    private final ThreatIndicatorRepository repository;

    @PostConstruct
    public void initMockData() {
        // RLS (enabled by RlsConfig) is a permanent DB-level setting that
        // survives restarts — on every run after the first, repository.count()
        // and the seed insert both need a tenant context.
        try {
            TenantContext.setTenantId(DEMO_TENANT_ID);
            if (repository.count() == 0) {
                log.info("Generating initial demo threat indicators...");
                generateMockIndicator(DEMO_TENANT_ID, "192.168.1.100", "IP", ThreatSeverity.HIGH, "Known C2 Server", "AlienVault");
                generateMockIndicator(DEMO_TENANT_ID, "malicious-domain.com", "DOMAIN", ThreatSeverity.CRITICAL, "Phishing Domain", "Internal");
                generateMockIndicator(DEMO_TENANT_ID, "45.33.22.11", "IP", ThreatSeverity.MEDIUM, "Suspicious Scanner", "CrowdStrike");
            }
        } finally {
            TenantContext.clear();
        }
    }

    private void generateMockIndicator(String tenantId, String value, String type, ThreatSeverity severity, String desc, String source) {
        ThreatIndicator indicator = ThreatIndicator.builder()
                .tenantId(tenantId)
                .value(value)
                .type(type)
                .severity(severity)
                .description(desc)
                .source(source)
                .lastSeen(LocalDateTime.now())
                .build();
        repository.save(indicator);
    }

    public List<ThreatIndicator> findAll(String tenantId) {
        return repository.findByTenantId(tenantId);
    }

    public Optional<ThreatIndicator> findByValue(String value, String tenantId) {
        return repository.findByValueAndTenantId(value, tenantId);
    }

    /**
     * Real, persisted enrichment — called from ThreatController after a
     * genuine VirusTotal/AbuseIPDB lookup (see ThreatIntelligenceGrpcClient/
     * ai-service's threat_intel_client.py) so a result a user actually
     * triggers shows up in the indicator list afterward instead of being
     * thrown away. Upserts by (tenantId, value) so re-enriching the same
     * IOC updates its existing row rather than duplicating it.
     */
    public ThreatIndicator saveEnrichmentResult(String tenantId, String value, String type,
            ThreatSeverity severity, String description, String source) {
        ThreatIndicator indicator = repository.findByValueAndTenantId(value, tenantId).orElseGet(ThreatIndicator::new);
        indicator.setTenantId(tenantId);
        indicator.setValue(value);
        indicator.setType(type);
        indicator.setSeverity(severity);
        indicator.setDescription(description);
        indicator.setSource(source);
        indicator.setLastSeen(LocalDateTime.now());
        return repository.save(indicator);
    }
}
