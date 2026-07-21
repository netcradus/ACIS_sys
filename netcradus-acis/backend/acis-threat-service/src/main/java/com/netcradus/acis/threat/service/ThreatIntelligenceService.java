package com.netcradus.acis.threat.service;

import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.threat.model.ThreatIndicator;
import com.netcradus.acis.threat.model.ThreatSeverity;
import com.netcradus.acis.threat.repository.ThreatIndicatorRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Random;

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
    private final Random random = new Random();

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

    @Scheduled(fixedRate = 600000) // Every 10 minutes
    public void updateFeeds() {
        // Demo-only synthetic feed refresh, scoped to the demo tenant — there is
        // no per-request context in a @Scheduled job, so this cannot (and must
        // not) be attributed to an arbitrary/real tenant. TenantContext must be
        // set explicitly here so the Row Level Security policy on
        // `threat_indicators` allows the insert.
        log.info("Refreshing demo threat feed...");
        try {
            TenantContext.setTenantId(DEMO_TENANT_ID);
            String randomIp = "10.0.0." + random.nextInt(255);
            generateMockIndicator(DEMO_TENANT_ID, randomIp, "IP", ThreatSeverity.LOW, "Auto-generated suspicious IP", "System Mock");
        } finally {
            TenantContext.clear();
        }
    }
}
