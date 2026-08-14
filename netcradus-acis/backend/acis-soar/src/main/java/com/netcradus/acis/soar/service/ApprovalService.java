package com.netcradus.acis.soar.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.soar.model.ContainmentApproval;
import com.netcradus.acis.soar.model.Playbook;
import com.netcradus.acis.soar.model.PlaybookExecution;
import com.netcradus.acis.soar.repository.ContainmentApprovalRepository;
import com.netcradus.acis.soar.repository.PlaybookRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Real approval gate sitting in front of PlaybookService.startExecution for
 * high-impact playbooks - "Do not implement destructive or irreversible
 * actions without explicit safeguards" is enforced here, not left to the
 * caller's discretion. A playbook is classified HIGH risk if any of its
 * steps contain a dangerous keyword (disable/revoke/isolate/quarantine/
 * block) - the same keywords PlaybookService's own dispatch already keys
 * off of, so classification never drifts out of sync with what a step
 * would actually do.
 *
 * The one safeguard that matters most: the user who requested an action can
 * never be the one who approves it (see approve() - real two-person
 * integrity, not just a status flag).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ApprovalService {

    private static final List<String> HIGH_RISK_KEYWORDS = List.of(
            "disable", "revoke", "reset", "isolate", "quarantine", "block");

    private final PlaybookRepository playbookRepository;
    private final PlaybookService playbookService;
    private final ContainmentApprovalRepository approvalRepository;
    private final AuditEventPublisher auditEventPublisher;
    private final ObjectMapper objectMapper;

    public sealed interface ExecutionOutcome permits Executed, PendingApproval {}
    public record Executed(PlaybookExecution execution) implements ExecutionOutcome {}
    public record PendingApproval(ContainmentApproval approval) implements ExecutionOutcome {}

    public ExecutionOutcome requestOrExecute(UUID playbookId, UUID tenantId, UUID userId, String userEmail,
            String bearerToken, Map<String, String> params) {
        Playbook playbook = playbookRepository.findByIdAndTenantId(playbookId, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("Playbook not found"));

        if (!isHighRisk(playbook)) {
            return new Executed(playbookService.startExecution(playbookId, tenantId, userId, userEmail, bearerToken, params));
        }

        ContainmentApproval approval = new ContainmentApproval();
        approval.setTenantId(tenantId);
        approval.setPlaybookId(playbookId);
        approval.setPlaybookName(playbook.getName());
        approval.setRequestedBy(userId);
        approval.setRequestedByName(userEmail);
        approval.setRiskLevel("HIGH");
        approval.setActionSummary("Playbook \"" + playbook.getName()
                + "\" contains high-impact steps (account/session/endpoint/network containment) and requires a second approver before it runs.");
        try {
            // Deliberately NOT storing bearerToken here: it would be stale by
            // approval time (JWTs are short-lived, approvals are not
            // instantaneous) and the one downstream call that uses it
            // (asset-service isolate/quarantine, see PlaybookService) already
            // doesn't validate it - see PlaybookController.executePlaybook's
            // doc comment. Persisting a bearer token at rest for no real
            // benefit would be a pure security cost.
            approval.setParamsJson(objectMapper.writeValueAsString(Map.of("params", params)));
        } catch (Exception e) {
            approval.setParamsJson("{}");
        }
        approval = approvalRepository.save(approval);

        auditEventPublisher.publish("CONTAINMENT_APPROVAL_REQUESTED", "playbook/" + playbookId,
                "approvalId=" + approval.getId() + " requestedBy=" + userEmail);
        log.info("High-risk playbook {} execution requires approval - request {} created", playbook.getName(), approval.getId());
        return new PendingApproval(approval);
    }

    @SuppressWarnings("unchecked")
    public ContainmentApproval approve(UUID approvalId, UUID tenantId, UUID approverId, String approverEmail) {
        ContainmentApproval approval = approvalRepository.findByIdAndTenantId(approvalId, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("Approval request not found"));

        if (!"PENDING".equals(approval.getStatus())) {
            throw new IllegalStateException("This approval request has already been decided");
        }
        // Real two-person integrity: the requester approving their own request would make
        // this whole gate theater. Compare by user ID when available, else by email as a
        // fallback for system/automated requesters.
        boolean sameRequester = (approval.getRequestedBy() != null && approval.getRequestedBy().equals(approverId))
                || (approval.getRequestedBy() == null && approverEmail != null && approverEmail.equals(approval.getRequestedByName()));
        if (sameRequester) {
            throw new IllegalStateException("You cannot approve a containment action you requested yourself - a second approver is required");
        }

        try {
            Map<String, Object> decoded = objectMapper.readValue(approval.getParamsJson(), Map.class);
            Map<String, String> params = (Map<String, String>) decoded.getOrDefault("params", Map.of());

            PlaybookExecution execution = playbookService.startExecution(
                    approval.getPlaybookId(), tenantId, approverId, approverEmail, null, params);

            approval.setStatus("APPROVED");
            approval.setApprovedBy(approverId);
            approval.setApprovedByName(approverEmail);
            approval.setDecidedAt(OffsetDateTime.now());
            approval.setExecutionId(execution.getId());
            approval = approvalRepository.save(approval);

            auditEventPublisher.publish("CONTAINMENT_APPROVAL_APPROVED", "approval/" + approvalId,
                    "approvedBy=" + approverEmail + " executionId=" + execution.getId());
            return approval;
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to execute approved playbook: " + e.getMessage());
        }
    }

    public ContainmentApproval reject(UUID approvalId, UUID tenantId, UUID approverId, String approverEmail, String reason) {
        ContainmentApproval approval = approvalRepository.findByIdAndTenantId(approvalId, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("Approval request not found"));
        if (!"PENDING".equals(approval.getStatus())) {
            throw new IllegalStateException("This approval request has already been decided");
        }
        approval.setStatus("REJECTED");
        approval.setApprovedBy(approverId);
        approval.setApprovedByName(approverEmail);
        approval.setDecidedAt(OffsetDateTime.now());
        approval.setRejectionReason(reason);
        approval = approvalRepository.save(approval);

        auditEventPublisher.publish("CONTAINMENT_APPROVAL_REJECTED", "approval/" + approvalId,
                "rejectedBy=" + approverEmail + " reason=" + reason);
        return approval;
    }

    public List<ContainmentApproval> list(UUID tenantId) {
        return approvalRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    private boolean isHighRisk(Playbook playbook) {
        String stepsLower = playbook.getSteps() == null ? "" : playbook.getSteps().toLowerCase();
        return HIGH_RISK_KEYWORDS.stream().anyMatch(stepsLower::contains);
    }
}
