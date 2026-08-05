package com.netcradus.acis.soar.integrations.guardduty;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One tenant's AWS GuardDuty connection — polled by IntegrationPollerService
 * for real findings via the AWS SDK (SigV4-signed calls, not hand-rolled).
 * accessKeyIdEncrypted/secretAccessKeyEncrypted are AES-encrypted (see
 * CredentialEncryptor). systemApiKeyEncrypted is a real ACIS API key the
 * poller uses to push fetched findings through /api/ingest/external/json —
 * see PaloAltoIntegration for the same pattern.
 */
@Data
@Entity
@Table(name = "guardduty_integrations")
public class GuardDutyIntegration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, unique = true)
    private UUID tenantId;

    @Column(name = "access_key_id_encrypted", nullable = false)
    private String accessKeyIdEncrypted;

    @Column(name = "secret_access_key_encrypted", nullable = false)
    private String secretAccessKeyEncrypted;

    @Column(name = "region", nullable = false)
    private String region;

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
