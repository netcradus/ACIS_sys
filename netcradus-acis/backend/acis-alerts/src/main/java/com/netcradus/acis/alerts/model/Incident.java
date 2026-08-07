package com.netcradus.acis.alerts.model;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * A real, persisted incident — replaces what used to be 5 hardcoded literal
 * objects that only ever lived in React state (create/update/mitigate never
 * called any backend). May optionally reference the real Alert it was
 * escalated from (alertId), but can also stand alone.
 */
@Entity
@Table(name = "incidents")
@Data
public class Incident {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String tenantId;

    /** Real, sequential per-tenant display id (e.g. "INC-1001") — assigned once at creation, never reused. */
    @Column(name = "incident_number", nullable = false)
    private String incidentNumber;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String severity; // CRITICAL, HIGH, MEDIUM, LOW

    @Column(nullable = false)
    private String status = "OPEN"; // OPEN, INVESTIGATING, MITIGATED, CLOSED

    private String ownerId;
    private String ownerName;

    /** Nullable — the real Alert this incident was escalated from, if any. */
    @Column(name = "alert_id")
    private String alertId;

    /** Real checklist, toggled by real user action — see IncidentController's /checklist endpoint. JSON array of {label, done}. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String checklist;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        if (status == null) status = "OPEN";
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
