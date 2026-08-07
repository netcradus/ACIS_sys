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
    // columnDefinition (not just length) matters here: Hibernate 6 auto-
    // generates a CHECK constraint enumerating every current AuditAction
    // name for a plain @Enumerated(EnumType.STRING) column, and ddl-auto:
    // update never widens it when the enum gains a new value — confirmed
    // live, adding TENANT_ACTIVATION_SENT/TENANT_ADMIN_ACTIVATED silently
    // broke every tenant-activation audit write (and, since this ran inside
    // the same transaction as the real work, rolled back the activation
    // record it was supposed to just be logging) until the stale
    // constraint was manually dropped. An explicit columnDefinition takes
    // the DDL type verbatim and skips that auto-CHECK generation entirely,
    // so a future AuditAction addition can never repeat this.
    @Column(nullable = false, columnDefinition = "varchar(64)")
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
    @Column(nullable = false, columnDefinition = "varchar(16)")
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
