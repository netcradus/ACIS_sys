package com.netcradus.acis.platformadmin.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A real, single-use, expiring onboarding link — what the "activate your
 * account" email a Platform Admin's "New Tenant" action sends actually
 * points at. Named distinctly from acis-soar's own "invitations" table
 * (same physical database, different service, different concept): this is
 * for provisioning a brand-new tenant's very first administrator, who has
 * no UserMember/console-role context yet, not for inviting an additional
 * member into an already-running tenant.
 *
 * tokenHash mirrors Invitation/ApiKey's pattern (SHA-256, raw value never
 * persisted — the email is the only place the real token ever appears).
 * No Row Level Security applies to this table (see Tenant's own Javadoc —
 * this service's tables are the platform's cross-tenant registry).
 */
@Data
@Entity
@Table(name = "tenant_activations")
public class TenantActivation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "admin_name", nullable = false)
    private String adminName;

    @Column(name = "admin_email", nullable = false)
    private String adminEmail;

    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "consumed_at")
    private OffsetDateTime consumedAt;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }

    public boolean isValid() {
        return consumedAt == null && expiresAt.isAfter(OffsetDateTime.now());
    }
}
