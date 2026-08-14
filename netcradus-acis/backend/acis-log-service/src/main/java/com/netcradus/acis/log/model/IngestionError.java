package com.netcradus.acis.log.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

/**
 * A real ingestion-pipeline failure - malformed payload, enrichment timeout,
 * Elasticsearch write failure, syslog parse error, etc. Recorded at every
 * point the pipeline currently only logs-and-continues, so the Dashboard's
 * "Ingest Volume vs Errors" panel has real failure counts to chart instead
 * of inventing them. Not tenant-scoped (same as IngestMetricsService) - this
 * is pipeline-wide operational telemetry, not tenant-owned business data,
 * and some failures (e.g. a malformed payload with no parseable tenant)
 * happen before any tenant is even known.
 */
@Entity
@Table(name = "ingestion_errors")
@Data
public class IngestionError {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** e.g. "splunk_hec", "syslog", "json_ingest", "enrichment", "es_persist". */
    @Column(nullable = false)
    private String source;

    /** Short real failure reason - the actual exception message, not a canned string. */
    @Column(length = 1000)
    private String reason;

    @Column(nullable = false)
    private Instant occurredAt;

    @PrePersist
    protected void onCreate() {
        if (occurredAt == null) {
            occurredAt = Instant.now();
        }
    }
}
