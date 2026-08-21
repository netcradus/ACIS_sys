package com.netcradus.acis.alerts.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

/**
 * Read-only view of acis-soar's audit_entries table (same physical Postgres
 * instance, shared across modules) — this module never writes here;
 * acis-soar's AuditEventConsumer is the sole writer. Exists so the real
 * per-alert/incident investigation timeline can be read under this module's
 * own "Alerts &amp; Correlation" RBAC gate instead of proxying through
 * acis-soar's "Reports &amp; Compliance"-gated /api/compliance/audit-trail.
 */
@Entity
@Immutable
@Table(name = "audit_entries")
@Data
public class AuditEntryView {

    @Id
    private UUID id;

    @Column(name = "tenant_id")
    private UUID tenantId;

    /** ISO-8601 string, set by acis-soar's AuditEntry.prePersist() — not a LocalDateTime column. */
    private String timestamp;

    @Column(name = "username")
    private String user;

    private String action;
    private String resource;
    private String status;
}
