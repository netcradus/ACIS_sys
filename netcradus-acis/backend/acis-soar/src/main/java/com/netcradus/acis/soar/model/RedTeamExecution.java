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

    @PrePersist
    public void prePersist() {
        if (startedAt == null) {
            startedAt = OffsetDateTime.now();
        }
    }
}
