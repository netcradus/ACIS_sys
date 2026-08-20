package com.netcradus.acis.alerts.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.JoinColumn;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "alerts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Alert {

    @Id
    private String id; // format: AL-XXXX

    @Column(nullable = false)
    private String tenantId;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String severity; // CRITICAL, HIGH, MEDIUM, LOW

    private String source;

    @Column(nullable = false)
    private String status; // OPEN, INVESTIGATING, MITIGATED, CLOSED

    private String ownerId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String rawEvent;

    /**
     * Real analyst-confirmed classification (malware, exfiltration,
     * lateral_movement, phishing, privilege_escalation, benign) — set only
     * when a human reviewer explicitly confirms it while resolving the
     * alert, never inferred/guessed. This is the actual ground truth the
     * classifier retraining pipeline trains on; labeledAt lets the training
     * job find only samples confirmed since the last training run.
     */
    private String confirmedCategory;
    private LocalDateTime labeledAt;

    /**
     * Real source-event time this alert was detected from (see
     * NormalizedEvent.timestamp / CorrelationEngine.triggerAlert) — null for
     * alerts with no traceable source event. createdAt - eventOccurredAt is
     * the real Mean Time to Detect, never a fabricated/estimated value.
     */
    private LocalDateTime eventOccurredAt;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** Real ai-service /ai/anomaly score computed at creation time - see AnomalyScoringService. Null when ai-service was unreachable. */
    private Double anomalyScore;
    private Boolean isAnomaly;
    private String anomalyFeatures;

    /** Rule-authored risk score (CorrelationRule.riskScore), copied through at trigger time. Null for alerts with no backing rule (e.g. IOC-only alerts) - never a fabricated number. */
    private Integer riskScore;

    @ElementCollection
    @CollectionTable(name = "alert_mitre_techniques", joinColumns = @JoinColumn(name = "alert_id"))
    @Column(name = "technique")
    private List<String> mitreTechniques;

    /** Set only when this alert was caused by a red-team simulation's synthetic event - powers the detection-validation loop. */
    private String redTeamExecutionId;
    private Boolean iocMatched;
    private String iocSeverity;
    private String iocSource;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
        if (status == null) {
            status = "OPEN";
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
