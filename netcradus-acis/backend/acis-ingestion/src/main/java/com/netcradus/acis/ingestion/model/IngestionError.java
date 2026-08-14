package com.netcradus.acis.ingestion.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

/**
 * Same physical table as acis-log-service's IngestionError - both services
 * write real failures from their own side of the pipeline into it (this one:
 * malformed HEC/JSON payloads, syslog socket errors; acis-log-service:
 * enrichment/Elasticsearch failures further downstream). Retention cleanup
 * runs once, from acis-log-service's IngestionErrorService, so it isn't
 * duplicated here.
 */
@Entity
@Table(name = "ingestion_errors")
@Data
public class IngestionError {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String source;

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
