package com.netcradus.acis.common.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AlertDto {
    private String id;
    private String tenantId;
    private String title;
    private String severity; // CRITICAL, HIGH, MEDIUM, LOW
    private String source;
    private String status; // OPEN, INVESTIGATING, MITIGATED, CLOSED
    private String ownerId;
    private String ownerName;
    private String rawEvent;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
