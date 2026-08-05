package com.netcradus.acis.soar.integrations.wazuh;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One tenant's Wazuh Indexer connection — polled by IntegrationPollerService
 * for real alerts via Wazuh's OpenSearch-compatible search API. passwordEncrypted
 * is AES-encrypted (see CredentialEncryptor). systemApiKeyEncrypted is a real
 * ACIS API key the poller uses to push fetched alerts through
 * /api/ingest/external/json — see PaloAltoIntegration for the same pattern.
 */
@Data
@Entity
@Table(name = "wazuh_integrations")
public class WazuhIntegration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, unique = true)
    private UUID tenantId;

    /** Wazuh Indexer base URL, e.g. https://wazuh-indexer.example.com:9200 */
    @Column(name = "base_url", nullable = false)
    private String baseUrl;

    @Column(name = "username", nullable = false)
    private String username;

    @Column(name = "password_encrypted", nullable = false)
    private String passwordEncrypted;

    @Column(name = "index_pattern", nullable = false)
    private String indexPattern = "wazuh-alerts-*";

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
