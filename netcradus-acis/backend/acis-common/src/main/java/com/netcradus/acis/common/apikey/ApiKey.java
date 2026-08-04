package com.netcradus.acis.common.apikey;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A tenant-scoped API key for machine-to-machine access (e.g. an external
 * system pushing logs via /api/ingest/external/**). Shared between acis-soar
 * (management CRUD — Settings > API Keys) and acis-ingestion (validating
 * inbound requests), so it lives in acis-common rather than either service.
 *
 * The raw secret is never persisted — only its SHA-256 hash (tokenHash) is
 * stored, plus a short tokenPreview (the secret's last 4 characters) so an
 * admin can tell keys apart in the UI without the real value ever being
 * retrievable again after creation.
 */
@Data
@Entity
@Table(name = "api_keys")
public class ApiKey {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false,
            columnDefinition = "uuid default '00000000-0000-0000-0000-000000000001'")
    private UUID tenantId;

    @Column(name = "key_name")
    private String keyName;

    @Column(name = "token_hash", unique = true)
    private String tokenHash;

    @Column(name = "token_preview")
    private String tokenPreview;

    private String role;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @Column(name = "last_used_at")
    private OffsetDateTime lastUsedAt;

    private String status = "Active"; // Active, Revoked

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = OffsetDateTime.now();
        }
    }
}
