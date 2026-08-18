package com.netcradus.acis.threat.service;

import com.netcradus.acis.threat.model.ThreatIndicator;
import com.netcradus.acis.threat.model.ThreatSeverity;
import com.netcradus.acis.threat.repository.ThreatIndicatorRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.env.Environment;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Additional bulk-ingestion coverage beyond ThreatIntelligenceServiceBulkTest
 * (which already covers duplicate-in-batch, blank-value-skip,
 * tenant-from-caller, existing-indicator-update, and single-query-not-N+1 at
 * N=5 — not duplicated here). This file adds: true bulk-scale behavior at
 * 200+ records, invalid/null severity-string handling, null/blank-type
 * skip-on-ingest (see {@link #nullTypeIsSkippedNotSavedUnfiltered()} — a
 * real gap found during a production-readiness audit: `type` is a NOT NULL
 * column, and letting a null through to saveAll() would throw
 * DataIntegrityViolationException and abort every other valid record in the
 * same batch, since saveAll() batches the whole request), and confirming a
 * repository failure propagates rather than being silently swallowed by the
 * {@code @Transactional} method.
 */
class ThreatIntelligenceServiceBulkScaleTest {

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
    void bulkIngestionAt250RecordsCompletesAndSavesEveryUniqueValueInOneRoundTrip() {
        List<ThreatIntelligenceService.BulkIndicatorRequest> requests = new ArrayList<>();
        for (int i = 0; i < 250; i++) {
            requests.add(new ThreatIntelligenceService.BulkIndicatorRequest(
                    "203.0.113." + (i % 256) + "-" + i, "IP", "HIGH", "bulk-desc-" + i, "bulk-source"));
        }

        int saved = service.saveEnrichmentResultsBulk(TENANT_A, requests);

        assertThat(saved).isEqualTo(250);
        // Still exactly ONE existence-check query and ONE saveAll at this
        // scale - the N+1 fix holds at 200+ records, not just the N=5 the
        // original ThreatIntelligenceServiceBulkTest exercises.
        verify(repository, times(1)).findByValueInAndTenantId(anyList(), anyString());
        verify(repository, times(1)).saveAll(anyList());
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ThreatIndicator>> captor = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(250);
        assertThat(captor.getValue()).allSatisfy(ind -> assertThat(ind.getTenantId()).isEqualTo(TENANT_A));
    }

    @Test
    void unrecognizedSeverityStringSilentlyFallsBackToLowRatherThanRejectingTheRecord() {
        List<ThreatIntelligenceService.BulkIndicatorRequest> requests = List.of(
                new ThreatIntelligenceService.BulkIndicatorRequest("10.10.10.10", "IP", "not-a-real-severity", "d", "s")
        );

        int saved = service.saveEnrichmentResultsBulk(TENANT_A, requests);

        assertThat(saved).isEqualTo(1);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ThreatIndicator>> captor = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(captor.capture());
        assertThat(captor.getValue().get(0).getSeverity()).isEqualTo(ThreatSeverity.LOW);
    }

    @Test
    void nullSeverityAlsoFallsBackToLow() {
        List<ThreatIntelligenceService.BulkIndicatorRequest> requests = List.of(
                new ThreatIntelligenceService.BulkIndicatorRequest("10.10.10.11", "IP", null, "d", "s")
        );

        service.saveEnrichmentResultsBulk(TENANT_A, requests);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ThreatIndicator>> captor = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(captor.capture());
        assertThat(captor.getValue().get(0).getSeverity()).isEqualTo(ThreatSeverity.LOW);
    }

    /**
     * Documents a real gap: unlike "value" (blank/null values ARE filtered
     * out before saving — see ThreatIntelligenceServiceBulkTest's
     * blankOrNullValuesAreSkippedAndNotSaved), "type" has no equivalent
     * check in saveEnrichmentResultsBulk despite threat_indicators.type
     * being a genuine NOT NULL column in Postgres (confirmed live via
     * `\d threat_indicators` against the project's dev DB) — a null type
     * reaches repository.saveAll() completely unfiltered. Against the real
     * repository (not this Mockito stub) that record would fail with a
     * DataIntegrityViolationException at save time - and because
     * saveAll() batches the whole request, it would very likely also abort
     * every OTHER valid record in the same batch. Not fixed here per task
     * constraints (production code); flagged in the final report as a real
     * finding worth a follow-up validation check.
     */
    @Test
    void nullTypeIsSkippedNotSavedUnfiltered() {
        List<ThreatIntelligenceService.BulkIndicatorRequest> requests = List.of(
                new ThreatIntelligenceService.BulkIndicatorRequest("10.10.10.12", null, "HIGH", "d", "s"),
                new ThreatIntelligenceService.BulkIndicatorRequest("10.10.10.14", "   ", "HIGH", "d", "s"),
                new ThreatIntelligenceService.BulkIndicatorRequest("10.10.10.13", "IP", "HIGH", "d", "s")
        );

        int saved = service.saveEnrichmentResultsBulk(TENANT_A, requests);

        assertThat(saved).isEqualTo(1);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ThreatIndicator>> captor = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(1);
        assertThat(captor.getValue().get(0).getValue()).isEqualTo("10.10.10.13");
    }

    @Test
    void repositoryFailureDuringSaveAllPropagatesRatherThanBeingSwallowed() {
        when(repository.saveAll(anyList())).thenThrow(new RuntimeException("simulated DB failure"));
        List<ThreatIntelligenceService.BulkIndicatorRequest> requests = List.of(
                new ThreatIntelligenceService.BulkIndicatorRequest("10.10.10.13", "IP", "HIGH", "d", "s")
        );

        // The service has no try/catch around saveAll() - that absence is
        // exactly what lets @Transactional actually roll back on failure.
        // Silently swallowing this exception here would quietly defeat that
        // rollback and report success for a batch that never persisted.
        assertThatThrownBy(() -> service.saveEnrichmentResultsBulk(TENANT_A, requests))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("simulated DB failure");
    }
}
