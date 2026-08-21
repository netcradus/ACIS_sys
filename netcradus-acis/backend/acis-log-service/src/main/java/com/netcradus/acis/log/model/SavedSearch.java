package com.netcradus.acis.log.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

/**
 * A real, persisted Log Explorer search — the actual SPL query text a real
 * user chose to name and save, scoped to that tenant AND that user (personal,
 * not tenant-shared) so a saved search is only ever visible to the person who
 * created it. Replaces the previous localStorage-only implementation, which
 * was lost on every browser/device switch and never actually reached the
 * backend.
 */
@Entity
@Table(name = "saved_searches",
        uniqueConstraints = @UniqueConstraint(columnNames = {"tenant_id", "user_id", "name"}))
@Data
public class SavedSearch {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    /** The real authenticated user's email (from TenantContext, JWT-derived) — never client-supplied. */
    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(nullable = false)
    private String name;

    @Column(name = "query_text", nullable = false, columnDefinition = "TEXT")
    private String query;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
