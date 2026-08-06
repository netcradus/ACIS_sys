package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A real machine actually running the heartbeat script (install.ps1/
 * install.sh — see AgentController), identified by agentId: a UUID the
 * script generates once on first run and caches locally (%ProgramData%\ACIS
 * on Windows, /etc/acis on Linux/macOS), so re-checking-in after a hostname
 * change still updates the same row instead of creating a duplicate.
 *
 * status is deliberately not a stored column — see AgentController's
 * computeStatus: "ONLINE" is a live judgment (last heartbeat within the
 * expected interval), not a fact the agent itself reports, so storing it
 * would just go stale the moment a machine's heartbeat loop dies.
 */
@Data
@Entity
@Table(name = "agent_endpoints", uniqueConstraints = @UniqueConstraint(columnNames = {"tenant_id", "agent_id"}))
public class AgentEndpoint {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "agent_id", nullable = false)
    private String agentId;

    private String hostname;

    private String os;

    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "agent_version")
    private String agentVersion;

    @Column(name = "first_seen_at")
    private OffsetDateTime firstSeenAt;

    @Column(name = "last_heartbeat_at")
    private OffsetDateTime lastHeartbeatAt;

    @PrePersist
    public void prePersist() {
        if (firstSeenAt == null) firstSeenAt = OffsetDateTime.now();
    }
}
