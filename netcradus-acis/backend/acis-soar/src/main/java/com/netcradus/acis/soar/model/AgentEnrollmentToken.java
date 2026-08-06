package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The real, per-tenant secret a heartbeat script (see the install.ps1/
 * install.sh scripts served by AgentController) presents to authenticate
 * itself before any AgentEndpoint exists for it — same "authenticate a
 * machine caller with no JWT yet" shape as ApiKey, but deliberately kept as
 * its own table/lookup rather than reusing api_keys: this is a low-privilege,
 * install-only credential (it can only create/update AgentEndpoint rows, not
 * touch any tenant data), and unlike ApiKey it's meant to be persistently
 * re-viewable by an admin (real EDR/RMM products show install keys this way)
 * rather than shown once — so, unlike ApiKey/Invitation, the raw value IS
 * stored here, not just its hash. tokenHash still backs the actual lookup
 * (indexed, and means a DB leak alone doesn't hand out working tokens
 * without also compromising query access to rawToken).
 *
 * One row per tenant: regenerating overwrites tokenHash/rawToken in place
 * rather than superseding like Invitation, since there's no "old link still
 * mid-flight" concern here — any already-installed agent just needs the new
 * token pushed to it the same way the old one was.
 */
@Data
@Entity
@Table(name = "agent_enrollment_tokens")
public class AgentEnrollmentToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, unique = true)
    private UUID tenantId;

    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    @Column(name = "raw_token", nullable = false)
    private String rawToken;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }
}
