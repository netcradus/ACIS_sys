package com.netcradus.acis.soar.integrations.azuresentinel;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One tenant's Azure Sentinel connection — polled by IntegrationPollerService
 * for real incidents via Sentinel's REST API (Microsoft.SecurityInsights).
 * Authenticates as an Azure AD App Registration (client credentials flow —
 * see AzureOAuthClient). clientSecretEncrypted is AES-encrypted (see
 * CredentialEncryptor). systemApiKeyEncrypted is a real ACIS API key the
 * poller uses to push fetched incidents through /api/ingest/external/json.
 */
@Data
@Entity
@Table(name = "azuresentinel_integrations")
public class AzureSentinelIntegration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, unique = true)
    private UUID tenantId;

    /** The Azure AD tenant (directory) the App Registration lives in — not this ACIS tenant. */
    @Column(name = "azure_tenant_id", nullable = false)
    private String azureTenantId;

    @Column(name = "client_id", nullable = false)
    private String clientId;

    @Column(name = "client_secret_encrypted", nullable = false)
    private String clientSecretEncrypted;

    @Column(name = "subscription_id", nullable = false)
    private String subscriptionId;

    @Column(name = "resource_group", nullable = false)
    private String resourceGroup;

    @Column(name = "workspace_name", nullable = false)
    private String workspaceName;

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
