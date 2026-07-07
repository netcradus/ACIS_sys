package com.netcradus.acis.log.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LogDocument {
    private String id;
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
