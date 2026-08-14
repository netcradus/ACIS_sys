package com.netcradus.acis.alerts.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;

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
