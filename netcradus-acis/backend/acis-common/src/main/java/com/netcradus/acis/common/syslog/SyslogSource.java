package com.netcradus.acis.common.syslog;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One tenant's real UDP/TCP syslog listener assignment. Raw syslog carries
 * no authentication of any kind, so unlike every other data source in ACIS,
 * tenancy here can't be proven by a token — it's proven by which port the
 * packet arrived on. assignedPort is allocated once (see
 * SyslogSourceController) from a fixed range and never reused while this row
 * exists. Shared between acis-soar (CRUD / port allocation, Settings > Data
 * Sources) and acis-ingestion (SyslogListenerService, which actually binds
 * the sockets), the same reason ApiKey lives here rather than in either
 * single service.
 */
@Data
@Entity
@Table(name = "syslog_sources")
public class SyslogSource {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, unique = true)
    private UUID tenantId;

    @Column(name = "assigned_port", nullable = false, unique = true)
    private Integer assignedPort;

    private boolean enabled = true;

    @Column(name = "last_received_at")
    private OffsetDateTime lastReceivedAt;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }
}
