package com.netcradus.acis.soar.integrations.sentinelone;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One tenant's SentinelOne Singularity connection — polled by
 * IntegrationPollerService for real threat data via SentinelOne's
 * Management API. apiTokenEncrypted is AES-encrypted (see CredentialEncryptor).
 * systemApiKeyEncrypted is a real ACIS API key the poller uses to push
 * fetched threats through /api/ingest/external/json — see
 * PaloAltoIntegration for the same pattern.
 */
@Data
@Entity
@Table(name = "sentinelone_integrations")
public class SentinelOneIntegration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, unique = true)
    private UUID tenantId;

    /** The tenant's own SentinelOne management console URL — multi-region SaaS, so this varies per customer. */
    @Column(name = "console_url", nullable = false)
    private String consoleUrl;

    @Column(name = "api_token_encrypted", nullable = false)
    private String apiTokenEncrypted;

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
