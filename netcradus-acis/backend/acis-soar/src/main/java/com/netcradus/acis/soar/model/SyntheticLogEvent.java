package com.netcradus.acis.soar.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Map;

/**
 * Kafka wire-format payload for synthetic red-team events, published to the
 * same "acis-logs" topic and JSON shape that acis-log-service's
 * LogIngestionService consumes. Deliberately a plain local POJO rather than
 * a shared/imported entity — acis-soar has no dependency on acis-log-service.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SyntheticLogEvent {
    private String id;
    private String tenantId;
    private Instant timestamp;
    private String message;
    private String level;
    private String service;
    private String host;
    private String traceId;
    private String spanId;
    private String assetName;
    private String assetType;
    private String threatSeverity;
    private String threatSource;
    private Map<String, Object> metadata;
}
