package com.netcradus.acis.soar.model;

import com.netcradus.acis.common.rbac.UserMember;
import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A real, single-use, expiring invite link — what the "Invite user" email
 * actually points at. tokenHash mirrors ApiKey's pattern (SHA-256, raw value
 * never persisted — the email is the only place the real token ever appears).
 * Only acis-soar ever needs to validate one (the public accept-invite flow
 * lives here too), so unlike UserMember/ConsoleRole this stays local rather
 * than moving to acis-common.
 */
@Data
@Entity
@Table(name = "invitations")
public class Invitation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_member_id", nullable = false)
    private UserMember userMember;

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
