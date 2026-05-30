package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "red_team_simulations")
public class RedTeamSimulation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id")
    private UUID tenantId;

    private String name;
    
    private String description;

    @ElementCollection
    @CollectionTable(name = "red_team_simulation_techniques", joinColumns = @JoinColumn(name = "simulation_id"))
    @Column(name = "technique")
    private java.util.List<String> mitreTechniques;

    @ElementCollection
    @CollectionTable(name = "red_team_simulation_tactics", joinColumns = @JoinColumn(name = "simulation_id"))
    @Column(name = "tactic")
    private java.util.List<String> mitreTactics;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String steps;

    @Column(name = "run_count")
    private Integer runCount = 0;

    @Column(name = "last_run_at")
    private OffsetDateTime lastRunAt;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = OffsetDateTime.now();
        }
    }
}
