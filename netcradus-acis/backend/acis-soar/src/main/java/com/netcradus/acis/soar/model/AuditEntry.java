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

    @PrePersist
    public void prePersist() {
        if (timestamp == null) {
            timestamp = OffsetDateTime.now().toString();
        }
    }
}
