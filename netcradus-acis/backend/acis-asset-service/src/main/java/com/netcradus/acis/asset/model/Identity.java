package com.netcradus.acis.asset.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * A real, persisted identity-to-asset access mapping — replaces what used
 * to be a hardcoded literal map keyed by specific asset names, present for
 * only 6 of the seeded assets and completely absent for every real asset
 * an admin registers. Manually registered (like the Asset it belongs to),
 * since there's no real IAM/AD integration in this system to auto-discover
 * these — see AssetController's Javadoc-equivalent note on Identity.
 */
@Entity
@Table(name = "identities")
@Data
public class Identity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "asset_id", nullable = false)
    private String assetId;

    @Column(nullable = false)
    private String username;

    private String role;

    @Column(name = "last_active")
    private LocalDateTime lastActive;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (lastActive == null) lastActive = LocalDateTime.now();
    }
}
