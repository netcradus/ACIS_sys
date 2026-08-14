package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Real two-person-integrity approval gate for high-impact playbook
 * executions (see ApprovalService for the risk classification and the
 * explicit same-user-cannot-approve-their-own-request safeguard). A
 * playbook classified HIGH risk never reaches PlaybookService.startExecution
 * until a row here reaches APPROVED - see PlaybookController/ApprovalService.
 */
@Data
@Entity
@Table(name = "containment_approvals")
public class ContainmentApproval {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "playbook_id", nullable = false)
    private UUID playbookId;

    @Column(name = "playbook_name")
    private String playbookName;

    @Column(name = "requested_by")
    private UUID requestedBy;

    @Column(name = "requested_by_name")
    private String requestedByName;

    @Column(name = "risk_level")
    private String riskLevel; // HIGH or CRITICAL

    @Column(name = "action_summary", length = 1000)
    private String actionSummary;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "params_json", columnDefinition = "jsonb")
    private String paramsJson;

    @Column(nullable = false)
    private String status = "PENDING"; // PENDING, APPROVED, REJECTED

    @Column(name = "approved_by")
    private UUID approvedBy;

    @Column(name = "approved_by_name")
    private String approvedByName;

    @Column(name = "decided_at")
    private OffsetDateTime decidedAt;

    @Column(name = "rejection_reason", length = 1000)
    private String rejectionReason;

    @Column(name = "execution_id")
    private UUID executionId;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }
}
