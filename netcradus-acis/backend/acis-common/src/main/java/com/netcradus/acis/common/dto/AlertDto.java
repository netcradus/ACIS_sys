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
    private String confirmedCategory;
    private LocalDateTime labeledAt;
    /** Real source-event time this alert was detected from - null for alerts with no traceable source event. Powers MTTD. */
    private LocalDateTime eventOccurredAt;

    /**
     * Real score from ai-service's /ai/anomaly (IsolationForest), computed
     * from this alert's own severity/source/rawEvent content at creation
     * time - null when ai-service was unreachable/timed out (fails open,
     * never fabricated). Higher = more anomalous.
     */
    private Double anomalyScore;
    private Boolean isAnomaly;
    /** Comma-joined top contributing feature names from ai-service's response, e.g. "lolbin_signal,severity_weight". */
    private String anomalyFeatures;
}
