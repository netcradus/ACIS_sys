package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "audit_entries")
public class AuditEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id")
    private UUID tenantId;

    private String timestamp;

    @Column(name = "username")
    private String user;
    private String action;
    private String resource;
    private String ip;
    private String status;

    /**
     * Real tamper-evidence: hash = SHA-256(prevHash + tenantId + timestamp +
     * user + action + resource + ip + status), chained per tenant so any
     * edit or deletion of a historical row breaks every hash after it - not
     * just a checksum of that one row, which an attacker could recompute
     * after tampering. See AuditEventConsumer (writer) and
     * ComplianceController's /audit-trail/verify (reader).
     */
    @Column(name = "prev_hash", length = 64)
    private String prevHash;

    @Column(name = "hash", length = 64)
    private String hash;

    @PrePersist
    public void prePersist() {
        if (timestamp == null) {
            timestamp = OffsetDateTime.now().toString();
        }
    }
}
