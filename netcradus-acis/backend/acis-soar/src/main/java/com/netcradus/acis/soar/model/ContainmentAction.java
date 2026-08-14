package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Real audit + rollback record for every containment action actually taken
 * (not the playbook step log, which is free text - this is the structured
 * record ContainmentActionService writes so a reversible action can later
 * be looked up and undone by ID, and so "what containment actions have run"
 * is a real, queryable list independent of which playbook triggered them).
 */
@Data
@Entity
@Table(name = "containment_actions")
public class ContainmentAction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "execution_id")
    private UUID executionId; // nullable - null when triggered ad-hoc rather than via a playbook

    @Column(name = "action_type", nullable = false)
    private String actionType; // DISABLE_ACCOUNT, REVOKE_SESSIONS, BLOCK_IP, ISOLATE_ENDPOINT

    @Column(name = "target_description")
    private String targetDescription; // human-readable, e.g. "user analyst2@acme.local" or "IP 1.2.3.4"

    /** Opaque reference needed to roll the action back - a Keycloak user ID, a Cloudflare rule ID, etc. */
    @Column(name = "external_ref")
    private String externalRef;

    @Column(name = "performed_by")
    private String performedBy;

    private boolean reversible;

    @Column(name = "rolled_back")
    private boolean rolledBack;

    @Column(name = "rolled_back_by")
    private String rolledBackBy;

    @Column(name = "rolled_back_at")
    private OffsetDateTime rolledBackAt;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }
}
