package com.netcradus.acis.threat.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "threat_indicators")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ThreatIndicator {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // Not DB-NOT-NULL: with no migration framework in place (ddl-auto=update),
    // a hard NOT NULL would fail schema-update on any DB that already has rows
    // from before this column existed. Enforced as non-null in application code instead.
    @Column(name = "tenant_id")
    private String tenantId;

    @Column(nullable = false)
    private String value; // The IoC (e.g., IP, domain, file hash)

    @Column(nullable = false)
    private String type; // e.g., IP, DOMAIN, HASH

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ThreatSeverity severity;

    private String description;

    private String source; // e.g., AlienVault, CrowdStrike, Internal

    @Column(name = "last_seen")
    private LocalDateTime lastSeen;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        lastSeen = LocalDateTime.now();
    }
}
