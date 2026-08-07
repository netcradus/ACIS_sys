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
public class CorrelationRuleDto {
    private String id;
    private String tenantId;
    private String name;
    private String description;
    private String splQuery;
    private String severity;
    private int riskScore;
    private boolean enabled;
    private String scheduleCron;
    private Integer windowMinutes;
    /** Real, parsed out of splQuery by CorrelationEngine (e.g. "count > 50") — null for simple predicate-match rules with no threshold clause. */
    private Integer threshold;
    private LocalDateTime lastRunAt;
    private LocalDateTime createdAt;
}
