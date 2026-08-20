package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "red_team_executions")
public class RedTeamExecution {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "simulation_id")
    private UUID simulationId;

    @Column(name = "triggered_by")
    private UUID triggeredBy;

    private String status = "running"; // running, completed, failed

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "step_logs", columnDefinition = "jsonb")
    private String stepLogs = "[]";

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    /** Distinct MITRE technique count actually emitted by the stages this execution built - the honest coverage denominator (see RedTeamService.executeSimulationAsync). */
    @Column(name = "total_technique_count")
    private Integer totalTechniqueCount;

    /** Distinct techniques with at least one real matching alert - never a raw alert count (a re-firing threshold rule must not inflate coverage). */
    @Column(name = "detected_technique_count")
    private Integer detectedTechniqueCount = 0;

    /** Real per-detection entries: {technique, alertId, alertTitle, severity, detectedAt, eventOccurredAt, mttdSeconds} - written by RedTeamDetectionConsumer as real alerts arrive. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "detection_logs", columnDefinition = "jsonb")
    private String detectionLogs = "[]";

    @Column(name = "first_detected_at")
    private OffsetDateTime firstDetectedAt;

    /** Time to first detection from simulation start (firstDetectedAt - startedAt) - the metric a real purple-team exercise actually reports. Null until (unless) a real detection occurs. */
    @Column(name = "mttd_seconds")
    private Long mttdSeconds;

    @PrePersist
    public void prePersist() {
        if (startedAt == null) {
            startedAt = OffsetDateTime.now();
        }
    }
}
