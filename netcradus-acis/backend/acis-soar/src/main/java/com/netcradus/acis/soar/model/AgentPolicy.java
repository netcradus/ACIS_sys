package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;

import java.util.UUID;

/**
 * Real, persisted per-tenant policy preferences for the lightweight
 * heartbeat agent (see AgentController's install scripts). Honestly scoped:
 * these are saved and returned for real, but the current heartbeat scripts
 * don't yet read or enforce any of them — they're a lightweight
 * presence/inventory agent (hostname/OS/IP on an interval), not a full EDR
 * with resource throttling, self-update, or tamper protection built in.
 * The Settings UI says so explicitly rather than implying enforcement that
 * doesn't exist.
 */
@Data
@Entity
@Table(name = "agent_policies")
public class AgentPolicy {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, unique = true)
    private UUID tenantId;

    @Column(name = "poll_rate")
    private String pollRate = "REALTIME"; // REALTIME, BATCH_5S, LOW_BANDWIDTH

    @Column(name = "cpu_cap_percent")
    private Integer cpuCapPercent = 5;

    @Column(name = "ram_cap_mb")
    private Integer ramCapMb = 128;

    @Column(name = "auto_update")
    private Boolean autoUpdate = true;

    @Column(name = "tamper_protect")
    private Boolean tamperProtect = true;
}
