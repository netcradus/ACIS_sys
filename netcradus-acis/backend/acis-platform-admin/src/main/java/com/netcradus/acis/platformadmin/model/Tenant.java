package com.netcradus.acis.platformadmin.model;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * The platform's own book of record for tenants — deliberately separate
 * from acis-soar's per-tenant "organizations"/"license_details" rows (a
 * tenant's own self-service Settings data). This table is never subject to
 * Row Level Security: it IS the registry every other service's scattered
 * tenant_id column points at, not a tenant-scoped row itself.
 *
 * The id is deliberately NOT @GeneratedValue: Hibernate's UUID generator
 * overwrites any id the caller already assigned, which breaks TenantSeeder's
 * need to pin the id to the pre-existing demo tenant UUID. Callers (the
 * seeder, or TenantAdminController#createTenant) must assign a UUID
 * explicitly before saving.
 */
@Entity
@Table(name = "tenants")
@Getter
@Setter
public class Tenant {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(unique = true)
    private String slug;

    // Explicit columnDefinition, not just nullable — see
    // PlatformAuditEvent.action's Javadoc for why: Hibernate auto-generates
    // a CHECK constraint enumerating the current enum's names for a plain
    // @Enumerated(EnumType.STRING) column, and ddl-auto:update never widens
    // it when a value is added later. Not currently broken (every
    // TenantStatus value predates this constraint), but a bare @Enumerated
    // here is the same landmine that just took down tenant activation
    // auditing — this heads it off before a future status value trips it.
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(32)")
    private TenantStatus status = TenantStatus.ACTIVE;

    private String planName;

    @ElementCollection(fetch = jakarta.persistence.FetchType.EAGER)
    @CollectionTable(name = "tenant_enabled_modules", joinColumns = @jakarta.persistence.JoinColumn(name = "tenant_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "module")
    // EAGER's default fetch mode is SELECT (one extra query per row) — SUBSELECT
    // batches it into a single follow-up query for the whole result set instead,
    // avoiding an N+1 on listTenants()/findAll() as tenant count grows.
    @Fetch(FetchMode.SUBSELECT)
    private Set<TenantModule> enabledModules = new HashSet<>();

    private String contactEmail;
    private String contactName;

    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
    private OffsetDateTime suspendedAt;
    private String suspendedReason;

    // Populated by TenantAdminController from TenantActivationRepository —
    // never persisted here (this table has no onboarding-status column of
    // its own). "ACTIVE" once the admin has actually set a password and
    // logged in, "PENDING"/"EXPIRED" while their real link is outstanding,
    // "NONE" if no activation was ever issued (e.g. a self-service-signup
    // tenant, which never goes through this flow at all).
    @Transient
    private String adminActivationStatus;

    @Transient
    private OffsetDateTime adminActivationSentAt;

    @PrePersist
    protected void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
