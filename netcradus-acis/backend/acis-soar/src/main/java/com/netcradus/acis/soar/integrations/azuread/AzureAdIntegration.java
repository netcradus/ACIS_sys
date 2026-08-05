package com.netcradus.acis.soar.integrations.azuread;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One tenant's Azure AD sign-in log connection — polled by
 * IntegrationPollerService for real sign-in events via Microsoft Graph's
 * /auditLogs/signIns, using the same client-credentials OAuth2 flow as
 * AzureSentinelIntegration (see AzureOAuthClient), just a different scope
 * and no subscription/workspace scoping since Graph is tenant-scoped
 * directly. The App Registration needs AuditLog.Read.All (admin-consented).
 */
@Data
@Entity
@Table(name = "azuread_integrations")
public class AzureAdIntegration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, unique = true)
    private UUID tenantId;

    @Column(name = "azure_tenant_id", nullable = false)
    private String azureTenantId;

    @Column(name = "client_id", nullable = false)
    private String clientId;

    @Column(name = "client_secret_encrypted", nullable = false)
    private String clientSecretEncrypted;

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
