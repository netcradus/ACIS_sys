package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/** One real known-vulnerability match from OSV.dev (osv.dev) for a dependency in a submitted manifest. */
@Data
@Entity
@Table(name = "dependency_findings")
public class DependencyFinding {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "scan_id", nullable = false)
    private UUID scanId;

    private String ecosystem; // Maven, npm, PyPI, ...

    @Column(name = "package_name")
    private String packageName;

    private String version;

    @Column(name = "vulnerability_id")
    private String vulnerabilityId; // e.g. GHSA-xxxx or CVE-xxxx, as returned by OSV.dev

    private String severity; // CRITICAL/HIGH/MEDIUM/LOW, derived from OSV's CVSS data when present

    @Column(length = 2000)
    private String summary;

    @Column(name = "fixed_version")
    private String fixedVersion;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }
}
