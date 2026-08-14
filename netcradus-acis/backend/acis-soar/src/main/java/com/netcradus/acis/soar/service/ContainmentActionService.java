package com.netcradus.acis.soar.service;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.crypto.CredentialEncryptor;
import com.netcradus.acis.common.dto.AlertDto;
import com.netcradus.acis.soar.integrations.cloudflare.CloudflareClient;
import com.netcradus.acis.soar.integrations.cloudflare.CloudflareIntegration;
import com.netcradus.acis.soar.integrations.cloudflare.CloudflareIntegrationRepository;
import com.netcradus.acis.soar.model.ContainmentAction;
import com.netcradus.acis.soar.repository.ContainmentActionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.resource.UserResource;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Real containment actions - the substance behind SOAR "response" beyond a
 * step log claiming success. Every reversible action here (account
 * disable, IP block) is recorded as a ContainmentAction row carrying
 * whatever external reference (Keycloak user ID, Cloudflare rule ID) is
 * needed to actually undo it later via rollback(), not just re-run the
 * opposite step and hope. Irreversible-feeling actions (session revocation
 * - a session, once ended, cannot be un-ended) are marked reversible=false
 * so the UI never offers a rollback that would silently do nothing.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ContainmentActionService {

    private final Keycloak keycloakAdminClient;
    private final CloudflareClient cloudflareClient;
    private final CloudflareIntegrationRepository cloudflareIntegrationRepository;
    private final ContainmentActionRepository containmentActionRepository;
    private final AuditEventPublisher auditEventPublisher;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${acis.keycloak.realm}")
    private String realmName;

    @Value("${acis.credential-encryption-key}")
    private String credentialEncryptionKey;

    public record Result(boolean success, String message, ContainmentAction action) {}

    /** Real Keycloak account disable + full session revocation. Reversible via enableAccount. */
    public Result disableAccount(UUID tenantId, String userId, String performedBy, UUID executionId) {
        try {
            UserResource userResource = keycloakAdminClient.realm(realmName).users().get(userId);
            UserRepresentation user = userResource.toRepresentation();
            String username = user.getUsername();
            user.setEnabled(false);
            userResource.update(user);
            userResource.logout(); // real, full session revocation - not merely "disabled going forward"

            ContainmentAction action = recordAction(tenantId, executionId, "DISABLE_ACCOUNT",
                    "user " + username, userId, performedBy, true);
            auditEventPublisher.publish("CONTAINMENT_DISABLE_ACCOUNT", "user/" + userId, "performedBy=" + performedBy);
            log.warn("CONTAINMENT: disabled account and revoked sessions for user={} tenant={}", username, tenantId);
            return new Result(true, "Account " + username + " disabled and all sessions revoked", action);
        } catch (Exception e) {
            log.warn("Failed to disable account {}: {}", userId, e.getMessage());
            return new Result(false, "Failed to disable account: " + e.getMessage(), null);
        }
    }

    /** Real rollback for disableAccount. */
    public Result enableAccount(UUID tenantId, UUID containmentActionId, String performedBy) {
        Optional<ContainmentAction> actionOpt = containmentActionRepository.findByIdAndTenantId(containmentActionId, tenantId);
        if (actionOpt.isEmpty()) {
            return new Result(false, "Containment action not found", null);
        }
        ContainmentAction action = actionOpt.get();
        if (!"DISABLE_ACCOUNT".equals(action.getActionType())) {
            return new Result(false, "This action is not an account disable and cannot be rolled back this way", null);
        }
        if (action.isRolledBack()) {
            return new Result(false, "Already rolled back", null);
        }
        try {
            UserResource userResource = keycloakAdminClient.realm(realmName).users().get(action.getExternalRef());
            UserRepresentation user = userResource.toRepresentation();
            user.setEnabled(true);
            userResource.update(user);

            action.setRolledBack(true);
            action.setRolledBackBy(performedBy);
            action.setRolledBackAt(OffsetDateTime.now());
            containmentActionRepository.save(action);

            auditEventPublisher.publish("CONTAINMENT_ROLLBACK", "containment-action/" + containmentActionId, "performedBy=" + performedBy);
            log.warn("CONTAINMENT ROLLBACK: re-enabled account {} tenant={}", action.getTargetDescription(), tenantId);
            return new Result(true, "Account re-enabled", action);
        } catch (Exception e) {
            return new Result(false, "Failed to re-enable account: " + e.getMessage(), null);
        }
    }

    /** Session revocation alone (no account disable) - marked non-reversible, a real ended session cannot be un-ended. */
    public Result revokeSessions(UUID tenantId, String userId, String performedBy, UUID executionId) {
        try {
            UserResource userResource = keycloakAdminClient.realm(realmName).users().get(userId);
            String username = userResource.toRepresentation().getUsername();
            userResource.logout();

            ContainmentAction action = recordAction(tenantId, executionId, "REVOKE_SESSIONS",
                    "user " + username, userId, performedBy, false);
            auditEventPublisher.publish("CONTAINMENT_REVOKE_SESSIONS", "user/" + userId, "performedBy=" + performedBy);
            return new Result(true, "All active sessions revoked for " + username, action);
        } catch (Exception e) {
            return new Result(false, "Failed to revoke sessions: " + e.getMessage(), null);
        }
    }

    /** Real Cloudflare edge IP block, using the tenant's configured integration. Reversible via unblockIp. */
    public Result blockIp(UUID tenantId, String ip, String note, String performedBy, UUID executionId) {
        Optional<CloudflareIntegration> cf = cloudflareIntegrationRepository.findByTenantId(tenantId);
        if (cf.isEmpty() || !cf.get().isEnabled()) {
            return new Result(false, "No Cloudflare integration configured for this tenant - nothing was blocked", null);
        }
        try {
            String rawToken = CredentialEncryptor.decrypt(cf.get().getApiTokenEncrypted(), credentialEncryptionKey);
            String ruleId = cloudflareClient.blockIp(rawToken, cf.get().getZoneId(), ip, note);
            if (ruleId == null) {
                return new Result(false, "Cloudflare blocked the IP but did not return a rule ID - rollback will not be possible for this action", null);
            }
            ContainmentAction action = recordAction(tenantId, executionId, "BLOCK_IP", "IP " + ip, ruleId, performedBy, true);
            auditEventPublisher.publish("CONTAINMENT_BLOCK_IP", "ip/" + ip, "performedBy=" + performedBy);
            return new Result(true, "Blocked " + ip + " at the Cloudflare edge", action);
        } catch (CloudflareClient.CloudflareApiException e) {
            return new Result(false, "Cloudflare block failed: " + e.getMessage(), null);
        }
    }

    /** Real rollback for blockIp. */
    public Result unblockIp(UUID tenantId, UUID containmentActionId, String performedBy) {
        Optional<ContainmentAction> actionOpt = containmentActionRepository.findByIdAndTenantId(containmentActionId, tenantId);
        if (actionOpt.isEmpty()) {
            return new Result(false, "Containment action not found", null);
        }
        ContainmentAction action = actionOpt.get();
        if (!"BLOCK_IP".equals(action.getActionType()) || action.isRolledBack()) {
            return new Result(false, "This action cannot be rolled back (wrong type or already rolled back)", null);
        }
        Optional<CloudflareIntegration> cf = cloudflareIntegrationRepository.findByTenantId(tenantId);
        if (cf.isEmpty()) {
            return new Result(false, "Cloudflare integration is no longer configured for this tenant", null);
        }
        try {
            String rawToken = CredentialEncryptor.decrypt(cf.get().getApiTokenEncrypted(), credentialEncryptionKey);
            cloudflareClient.unblockIp(rawToken, cf.get().getZoneId(), action.getExternalRef());

            action.setRolledBack(true);
            action.setRolledBackBy(performedBy);
            action.setRolledBackAt(OffsetDateTime.now());
            containmentActionRepository.save(action);

            auditEventPublisher.publish("CONTAINMENT_ROLLBACK", "containment-action/" + containmentActionId, "performedBy=" + performedBy);
            return new Result(true, "Unblocked " + action.getTargetDescription(), action);
        } catch (CloudflareClient.CloudflareApiException e) {
            return new Result(false, "Cloudflare unblock failed: " + e.getMessage(), null);
        }
    }

    /**
     * Real escalation notification via the same Alert pipeline every other
     * real detection in this platform uses (Dashboard/WebSocket/Alerts list) -
     * no SMS/paging integration exists yet, so this is the one genuinely
     * working notification channel today, used honestly rather than claiming
     * an email/SMS send that would never actually happen.
     */
    public void escalate(UUID tenantId, String summary, String performedBy) {
        AlertDto alert = AlertDto.builder()
                .tenantId(tenantId.toString())
                .title("Escalation: " + summary)
                .severity("CRITICAL")
                .source("SOAR Escalation")
                .status("OPEN")
                .eventOccurredAt(LocalDateTime.now())
                .build();
        kafkaTemplate.send("acis.alerts", alert);
        auditEventPublisher.publish("CONTAINMENT_ESCALATE", "escalation", "performedBy=" + performedBy + " summary=" + summary);
    }

    private ContainmentAction recordAction(UUID tenantId, UUID executionId, String actionType,
            String targetDescription, String externalRef, String performedBy, boolean reversible) {
        ContainmentAction action = new ContainmentAction();
        action.setTenantId(tenantId);
        action.setExecutionId(executionId);
        action.setActionType(actionType);
        action.setTargetDescription(targetDescription);
        action.setExternalRef(externalRef);
        action.setPerformedBy(performedBy);
        action.setReversible(reversible);
        return containmentActionRepository.save(action);
    }
}
