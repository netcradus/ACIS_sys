package com.netcradus.acis.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NormalizedEvent {
    private String eventId;
    private String tenantId;
    private LocalDateTime timestamp;
    private String sourceType; // firewall, endpoint, cloud, email, proxy, edr
    private String srcIp;
    private String destIp;
    private String user;
    private String action;
    private String severity; // critical, high, medium, low, info
    private String raw;
    private List<String> tags;

    /** MITRE ATT&CK technique ID carried by the source event's own metadata (e.g. red-team synthetic events). Null for sources with no technique tag. */
    private String mitreTechnique;
    /** Set only when this event originated from a red-team simulation stage — lets a resulting alert be traced back to the execution that caused it. */
    private String redTeamExecutionId;
    /** True iff EnrichmentClient.getThreatIntel() found a real hit for this event's IP. */
    private Boolean iocMatched;
    /** LOW/MEDIUM/HIGH/CRITICAL, verbatim from acis-threat-service — same vocabulary as Alert.severity. */
    private String iocSeverity;
    /** Threat-intel feed/source name, verbatim from acis-threat-service. */
    private String iocSource;
}
