package com.netcradus.acis.threat.service;

import com.netcradus.acis.threat.model.ThreatIndicator;
import com.netcradus.acis.threat.model.ThreatSeverity;
import com.netcradus.acis.threat.repository.ThreatIndicatorRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.env.Environment;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Real regression coverage for the N+1 fix in bulk indicator ingestion
 * (production-readiness audit) - proves the bulk path does exactly ONE
 * existence-check query regardless of batch size, and that the resulting
 * upsert/dedup/skip-blank behavior matches what the old per-record loop did.
 */
class ThreatIntelligenceServiceBulkTest {

    private ThreatIndicatorRepository repository;
    private ThreatIntelligenceService service;
    private static final String TENANT_A = "tenant-a";

    @BeforeEach
    void setUp() {
        repository = mock(ThreatIndicatorRepository.class);
        Environment environment = mock(Environment.class);
        service = new ThreatIntelligenceService(repository, environment);
        when(repository.findByValueInAndTenantId(anyList(), anyString())).thenReturn(List.of());
        when(repository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void bulkIngestionMakesExactlyOneExistenceCheckQueryRegardlessOfBatchSize() {
        List<ThreatIntelligenceService.BulkIndicatorRequest> requests = List.of(
                new ThreatIntelligenceService.BulkIndicatorRequest("1.1.1.1", "IP", "HIGH", "d1", "s1"),
                new ThreatIntelligenceService.BulkIndicatorRequest("2.2.2.2", "IP", "MEDIUM", "d2", "s2"),
                new ThreatIntelligenceService.BulkIndicatorRequest("3.3.3.3", "IP", "LOW", "d3", "s3"),
                new ThreatIntelligenceService.BulkIndicatorRequest("4.4.4.4", "IP", "CRITICAL", "d4", "s4"),
                new ThreatIntelligenceService.BulkIndicatorRequest("5.5.5.5", "IP", "HIGH", "d5", "s5")
        );

        service.saveEnrichmentResultsBulk(TENANT_A, requests);

        // The real fix: ONE SELECT (findByValueInAndTenantId) for the whole batch,
        // not one per record - previously this was N calls to findByValueAndTenantId.
        verify(repository, times(1)).findByValueInAndTenantId(anyList(), anyString());
        verify(repository, never()).findByValueAndTenantId(anyString(), anyString());
        // ONE saveAll() call, not N individual save() calls.
        verify(repository, times(1)).saveAll(anyList());
        verify(repository, never()).save(any());
    }

    @Test
    void blankOrNullValuesAreSkippedAndNotSaved() {
        List<ThreatIntelligenceService.BulkIndicatorRequest> requests = List.of(
                new ThreatIntelligenceService.BulkIndicatorRequest("6.6.6.6", "IP", "HIGH", "d", "s"),
                new ThreatIntelligenceService.BulkIndicatorRequest("", "IP", "HIGH", "d", "s"),
                new ThreatIntelligenceService.BulkIndicatorRequest(null, "IP", "HIGH", "d", "s"),
                new ThreatIntelligenceService.BulkIndicatorRequest("   ", "IP", "HIGH", "d", "s")
        );

        int saved = service.saveEnrichmentResultsBulk(TENANT_A, requests);

        assertThat(saved).isEqualTo(1);
        ArgumentCaptor<List<ThreatIndicator>> captor = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(1);
        assertThat(captor.getValue().get(0).getValue()).isEqualTo("6.6.6.6");
    }

    @Test
    void duplicateValueWithinTheSameBatchCollapsesToOneRowKeepingTheLastOne() {
        List<ThreatIntelligenceService.BulkIndicatorRequest> requests = List.of(
                new ThreatIntelligenceService.BulkIndicatorRequest("7.7.7.7", "IP", "LOW", "first", "vendor-a"),
                new ThreatIntelligenceService.BulkIndicatorRequest("7.7.7.7", "IP", "CRITICAL", "second", "vendor-b")
        );

        int saved = service.saveEnrichmentResultsBulk(TENANT_A, requests);

        assertThat(saved).isEqualTo(1);
        ArgumentCaptor<List<ThreatIndicator>> captor = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(1);
        ThreatIndicator only = captor.getValue().get(0);
        assertThat(only.getSeverity()).isEqualTo(ThreatSeverity.CRITICAL);
        assertThat(only.getDescription()).isEqualTo("second");
    }

    @Test
    void existingIndicatorIsUpdatedNotDuplicated() {
        ThreatIndicator existing = new ThreatIndicator();
        existing.setTenantId(TENANT_A);
        existing.setValue("8.8.8.8");
        existing.setSeverity(ThreatSeverity.LOW);
        when(repository.findByValueInAndTenantId(anyList(), anyString())).thenReturn(List.of(existing));

        List<ThreatIntelligenceService.BulkIndicatorRequest> requests = List.of(
                new ThreatIntelligenceService.BulkIndicatorRequest("8.8.8.8", "IP", "CRITICAL", "updated", "vendor")
        );

        service.saveEnrichmentResultsBulk(TENANT_A, requests);

        ArgumentCaptor<List<ThreatIndicator>> captor = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(1);
        // Same object identity as the existing row - an update, not a fresh insert.
        assertThat(captor.getValue().get(0)).isSameAs(existing);
        assertThat(existing.getSeverity()).isEqualTo(ThreatSeverity.CRITICAL);
    }

    @Test
    void tenantIsAlwaysSetFromTheCallerNeverFromRequestBody() {
        List<ThreatIntelligenceService.BulkIndicatorRequest> requests = List.of(
                new ThreatIntelligenceService.BulkIndicatorRequest("9.9.9.9", "IP", "HIGH", "d", "s")
        );

        service.saveEnrichmentResultsBulk("real-tenant", requests);

        ArgumentCaptor<List<ThreatIndicator>> captor = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(captor.capture());
        assertThat(captor.getValue().get(0).getTenantId()).isEqualTo("real-tenant");
    }
}
