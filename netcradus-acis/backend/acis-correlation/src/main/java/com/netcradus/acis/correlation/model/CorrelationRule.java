package com.netcradus.acis.correlation.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "correlation_rules")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CorrelationRule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String tenantId;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(nullable = false)
    private String splQuery;

    private String severity; // CRITICAL, HIGH, MEDIUM, LOW

    private int riskScore;

    @Builder.Default
    private boolean enabled = true;

    private String scheduleCron;

    private LocalDateTime lastRunAt;
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (severity == null) severity = "MEDIUM";
    }
}
