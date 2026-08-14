package com.netcradus.acis.common.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
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
    @NotBlank(message = "Rule name is required")
    @Size(max = 200, message = "Rule name must be 200 characters or fewer")
    private String name;
    @Size(max = 1000, message = "Description must be 1000 characters or fewer")
    private String description;
    // No max is set purely for cost/DoS reasons - matchesPredicate() runs this
    // pattern against every real event through the correlation engine, so an
    // unbounded query directly translates into unbounded per-event cost.
    @NotBlank(message = "splQuery is required")
    @Size(max = 4000, message = "splQuery must be 4000 characters or fewer")
    private String splQuery;
    @NotBlank(message = "Severity is required")
    @Pattern(regexp = "CRITICAL|HIGH|MEDIUM|LOW", message = "Severity must be one of CRITICAL, HIGH, MEDIUM, LOW")
    private String severity;
    @Min(value = 0, message = "riskScore must be between 0 and 100")
    @Max(value = 100, message = "riskScore must be between 0 and 100")
    private int riskScore;
    private boolean enabled;
    private String scheduleCron;
    @Min(value = 1, message = "windowMinutes must be at least 1")
    private Integer windowMinutes;
    /** Real, parsed out of splQuery by CorrelationEngine (e.g. "count > 50") — null for simple predicate-match rules with no threshold clause. */
    private Integer threshold;
    private LocalDateTime lastRunAt;
    private LocalDateTime createdAt;
}
