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
}
