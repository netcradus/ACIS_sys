package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/** One real credential-exposure match from local pattern-based secrets scanning (see SecretScanner). */
@Data
@Entity
@Table(name = "secret_findings")
public class SecretFinding {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "scan_id", nullable = false)
    private UUID scanId;

    @Column(name = "source_name")
    private String sourceName; // filename/label the caller submitted, untrusted display metadata only

    @Column(name = "rule_name")
    private String ruleName; // e.g. "AWS Access Key", "Private Key Block", "Generic High-Entropy Secret"

    private String severity;

    @Column(name = "line_number")
    private Integer lineNumber;

    /** Redacted preview only - e.g. "AKIA****************" - never the real secret value. */
    @Column(name = "redacted_match")
    private String redactedMatch;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }
}
