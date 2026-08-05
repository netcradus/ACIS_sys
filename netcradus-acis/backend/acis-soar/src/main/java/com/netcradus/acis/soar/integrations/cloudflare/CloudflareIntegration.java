package com.netcradus.acis.soar.integrations.cloudflare;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One tenant's Cloudflare configuration — what lets a SOAR playbook's "block"
 * step become a real edge-level IP block instead of a simulated one. apiToken
 * is stored AES-encrypted (see CredentialEncryptor); everything else is
 * plain, since none of it is sensitive on its own.
 */
@Data
@Entity
@Table(name = "cloudflare_integrations")
public class CloudflareIntegration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, unique = true)
    private UUID tenantId;

    @Column(name = "api_token_encrypted", nullable = false)
    private String apiTokenEncrypted;

    @Column(name = "zone_id", nullable = false)
    private String zoneId;

    private boolean enabled = true;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
        updatedAt = OffsetDateTime.now();
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
