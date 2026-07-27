package com.netcradus.acis.platformadmin.audit;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "platform_audit_events", indexes = {
    @Index(name = "idx_audit_timestamp", columnList = "timestamp"),
    @Index(name = "idx_audit_action", columnList = "action"),
    @Index(name = "idx_audit_admin_user", columnList = "adminUserId"),
    @Index(name = "idx_audit_target_user", columnList = "targetUserId"),
    @Index(name = "idx_audit_tenant", columnList = "tenantId"),
    @Index(name = "idx_audit_status", columnList = "status")
})
@Getter @Setter @NoArgsConstructor
public class PlatformAuditEvent {
    @Id
    private UUID id;
    @Column(nullable = false)
    private OffsetDateTime timestamp;
    @Column(nullable = false)
    private String adminUserId;
    @Column(nullable = false)
    private String adminUsername;
    private String adminEmail;
    private String targetUserId;
    private String targetUsername;
    private String targetEmail;
    private String tenantId;
    private String tenantName;
    @Column(nullable = false, length = 64)
    @Enumerated(EnumType.STRING)
    private AuditAction action;
    @Column(nullable = false, length = 32)
    private String resourceType;
    @Column(columnDefinition = "TEXT")
    private String previousValue;
    @Column(columnDefinition = "TEXT")
    private String newValue;
    private String ipAddress;
    @Column(length = 512)
    private String userAgent;
    @Column(nullable = false, length = 16)
    @Enumerated(EnumType.STRING)
    private AuditStatus status;
    @Column(columnDefinition = "TEXT")
    private String failureReason;

    @PrePersist
    protected void onCreate() {
        if (id == null) id = UUID.randomUUID();
        if (timestamp == null) timestamp = OffsetDateTime.now();
    }
}
