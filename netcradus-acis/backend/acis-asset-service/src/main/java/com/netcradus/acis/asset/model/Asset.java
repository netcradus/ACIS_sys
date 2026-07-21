package com.netcradus.acis.asset.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "assets")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Asset {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    // Not DB-NOT-NULL: with no migration framework in place (ddl-auto=update),
    // a hard NOT NULL would fail schema-update on any DB that already has rows
    // from before this column existed. Enforced as non-null in application code instead.
    @Column(name = "tenant_id")
    private String tenantId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String ipAddress;

    private String macAddress;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AssetType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AssetStatus status;

    private String owner;

    private String location;

    private String os;

    private String health = "OK";

    private String criticality = "HIGH";

    private String tags;

    @Column(name = "isolation_status")
    private Boolean isolationStatus = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
