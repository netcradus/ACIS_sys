package com.netcradus.acis.soar.integrations.paloalto;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One tenant's Palo Alto NGFW connection — polled by IntegrationPollerService
 * for traffic/threat logs via the real PAN-OS XML API. apiKeyEncrypted is the
 * firewall's own API key (generated on the firewall via type=keygen), stored
 * AES-encrypted (see CredentialEncryptor), never returned to the frontend
 * after save. systemApiKeyEncrypted is a real ACIS API key the poller uses to
 * push fetched logs through /api/ingest/external/json — an ordinary row in
 * api_keys, visible/revocable by the tenant like any key they created by hand.
 */
@Data
@Entity
@Table(name = "paloalto_integrations")
public class PaloAltoIntegration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, unique = true)
    private UUID tenantId;

    @Column(name = "hostname", nullable = false)
    private String hostname;

    @Column(name = "api_key_encrypted", nullable = false)
    private String apiKeyEncrypted;

    @Column(name = "system_api_key_encrypted")
    private String systemApiKeyEncrypted;

    private boolean enabled = true;

    @Column(name = "last_polled_at")
    private OffsetDateTime lastPolledAt;

    @Column(name = "last_poll_status")
    private String lastPollStatus;

    @Column(name = "last_poll_error", length = 1000)
    private String lastPollError;

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
