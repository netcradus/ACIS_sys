package com.netcradus.acis.threat.service;

import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.threat.model.ThreatIndicator;
import com.netcradus.acis.threat.model.ThreatSeverity;
import com.netcradus.acis.threat.repository.ThreatIndicatorRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
    private final Environment environment;

    @PostConstruct
    public void initMockData() {
        // Added during the production-readiness audit: this method's only
        // guard was repository.count()==0, which is exactly as true on a
        // real production database's first boot as it is in local dev - a
        // fresh prod deployment would otherwise get real demo threat
        // indicators seeded permanently. Same "!prod" convention
        // TenantSeeder/AssetDataSeeder/SeedConfig use, applied here to just
        // this method since the rest of this service does real enrichment
        // work needed in prod too.
        if (!environment.matchesProfiles("!prod")) {
            return;
        }
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

    /** Real database-level pagination - added during the production-readiness audit (previously unbounded). */
    public Page<ThreatIndicator> findAll(String tenantId, Pageable pageable) {
        return repository.findByTenantId(tenantId, pageable);
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

    public record BulkIndicatorRequest(String value, String type, String severity, String description, String source) {}

    /**
     * Real fix for the N+1 in bulk ingestion (see IntegrationPollerService's
     * GuardDuty/Azure AD findings -> ThreatController.ingestIndicators):
     * the previous version called findByValueAndTenantId + save() once per
     * record, so a 200-indicator batch was ~400 round trips. This does
     * exactly ONE existence-check query (findByValueInAndTenantId, a real
     * SQL IN clause) and ONE saveAll() - with hibernate.jdbc.batch_size set
     * (see application.yml), saveAll() also batches the actual INSERT/UPDATE
     * statements at the JDBC level instead of sending them one at a time.
     * Behavior is unchanged: still an upsert by (tenantId, value), still
     * skips blank values, still tenant-scoped.
     */
    @Transactional
    public int saveEnrichmentResultsBulk(String tenantId, List<BulkIndicatorRequest> requests) {
        List<BulkIndicatorRequest> valid = requests.stream()
                .filter(r -> r.value() != null && !r.value().isBlank())
                .toList();
        if (valid.isEmpty()) {
            return 0;
        }

        List<String> values = valid.stream().map(BulkIndicatorRequest::value).toList();
        Map<String, ThreatIndicator> existingByValue = new HashMap<>();
        for (ThreatIndicator existing : repository.findByValueInAndTenantId(values, tenantId)) {
            existingByValue.put(existing.getValue(), existing);
        }

        for (BulkIndicatorRequest req : valid) {
            ThreatIndicator indicator = existingByValue.getOrDefault(req.value(), new ThreatIndicator());
            ThreatSeverity severity;
            try {
                severity = ThreatSeverity.valueOf(req.severity() != null ? req.severity().toUpperCase() : "LOW");
            } catch (IllegalArgumentException e) {
                severity = ThreatSeverity.LOW;
            }
            indicator.setTenantId(tenantId);
            indicator.setValue(req.value());
            indicator.setType(req.type());
            indicator.setSeverity(severity);
            indicator.setDescription(req.description());
            indicator.setSource(req.source());
            indicator.setLastSeen(LocalDateTime.now());
            // Newly-created rows must be visible to later duplicates within the
            // SAME batch too (a batch can legitimately contain the same IOC
            // twice from two different findings) - without this, two "new"
            // entries for the same value would each get a fresh UUID and
            // insert as separate rows instead of the second updating the first.
            // Only put here (not also append to a separate save list) - the
            // final save set is exactly this map's values, so a same-batch
            // duplicate naturally collapses to one entry instead of being
            // queued for save twice.
            existingByValue.put(req.value(), indicator);
        }

        List<ThreatIndicator> toSave = new ArrayList<>(existingByValue.values());
        repository.saveAll(toSave);
        return toSave.size();
    }
}
