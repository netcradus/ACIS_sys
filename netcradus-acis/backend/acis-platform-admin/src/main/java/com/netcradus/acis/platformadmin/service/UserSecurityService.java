package com.netcradus.acis.platformadmin.service;

import com.netcradus.acis.platformadmin.audit.AuditAction;
import com.netcradus.acis.platformadmin.audit.PlatformAuditService;
import com.netcradus.acis.platformadmin.dto.LoginEventInfo;
import com.netcradus.acis.platformadmin.dto.UserSecurityInfo;
import com.netcradus.acis.platformadmin.dto.UserSessionInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.resource.RealmResource;
import org.keycloak.admin.client.resource.UserResource;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.EventRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.keycloak.representations.idm.UserSessionRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Service handling advanced user security operations via Keycloak Admin
 * REST API: password management, account locking, MFA, and sessions.
 * Each operation also records an audit event.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class UserSecurityService {

    private static final String RESOURCE_USER = "USER";
    private static final String RESOURCE_MFA = "MFA";
    private static final String RESOURCE_SESSION = "SESSION";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String TEMP_PASSWORD_CHARS =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";

    private final Keycloak keycloak;
    private final PlatformAuditService auditService;

    @Value("${acis.keycloak.realm}")
    private String realmName;

    private RealmResource realm() {
        return keycloak.realm(realmName);
    }

    private UserResource resolveUser(String userId) {
        UserResource resource = realm().users().get(userId);
        try {
            resource.toRepresentation();
        } catch (jakarta.ws.rs.NotFoundException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown user: " + userId);
        }
        return resource;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Security Overview
    // ═══════════════════════════════════════════════════════════════════

    public UserSecurityInfo getSecurityInfo(String userId) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();

        Map<String, Object> bruteForce = realm().attackDetection()
                .bruteForceUserStatus(userId);
        boolean bruteForceLocked = Boolean.TRUE.equals(bruteForce.get("disabled"));
        int failedAttempts = bruteForce.get("numFailures") instanceof Number n
                ? n.intValue() : 0;
        String lastFailure = bruteForce.get("lastFailure") != null
                ? bruteForce.get("lastFailure").toString() : null;

        List<UserSessionRepresentation> sessions = userResource.getUserSessions();
        boolean mfaEnabled = Boolean.TRUE.equals(user.isTotp());

        List<String> requiredActions = user.getRequiredActions() != null
                ? user.getRequiredActions() : List.of();
        boolean passwordChangeRequired = requiredActions.contains("UPDATE_PASSWORD");
        boolean mfaRequired = requiredActions.contains("CONFIGURE_TOTP");

        // Determine account status. bruteForceLocked is checked BEFORE the raw
        // enabled flag: a real Keycloak brute-force lock also flips enabled to
        // false as its actual disable mechanism (confirmed live — attack-detection
        // status showed disabled=true with numFailures below failureFactor, via
        // Keycloak's "quick login" fast-lockout path), and Keycloak's own scheduler
        // clears it automatically once the wait window elapses. An admin-initiated
        // lockAccount() call, by contrast, has bruteForceLocked=false — that's the
        // only signal that distinguishes a genuine admin disable from a transient
        // brute-force lock.
        String accountStatus;
        if (bruteForceLocked) {
            accountStatus = "TEMPORARILY_BLOCKED";
        } else if (!Boolean.TRUE.equals(user.isEnabled())) {
            accountStatus = "DISABLED";
        } else {
            accountStatus = "ACTIVE";
        }

        List<org.keycloak.representations.idm.CredentialRepresentation> credentials =
                userResource.credentials();
        int otpDeviceCount = (int) credentials.stream()
                .filter(c -> "otp".equals(c.getType()) || "totp".equals(c.getType()))
                .count();

        return new UserSecurityInfo(
                userId,
                user.getUsername(),
                accountStatus,
                Boolean.TRUE.equals(user.isEnabled()),
                bruteForceLocked,
                failedAttempts,
                lastFailure,
                mfaEnabled,
                mfaRequired,
                otpDeviceCount,
                passwordChangeRequired,
                requiredActions,
                sessions.size(),
                user.getCreatedTimestamp()
        );
    }

    // ═══════════════════════════════════════════════════════════════════
    // Password Management
    // ═══════════════════════════════════════════════════════════════════

    public void resetPassword(String userId, String newPassword, boolean temporary) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();

        CredentialRepresentation cred = new CredentialRepresentation();
        cred.setType(CredentialRepresentation.PASSWORD);
        cred.setValue(newPassword);
        cred.setTemporary(temporary);
        userResource.resetPassword(cred);

        auditService.record(AuditAction.PASSWORD_RESET, RESOURCE_USER,
                userId, user.getUsername(), user.getEmail(),
                firstAttr(user, "tenant_id"), null,
                null, temporary ? "temporary=true" : "temporary=false");
    }

    public String generateTempPassword(String userId) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();

        String tempPassword = generateSecurePassword(16);
        CredentialRepresentation cred = new CredentialRepresentation();
        cred.setType(CredentialRepresentation.PASSWORD);
        cred.setValue(tempPassword);
        cred.setTemporary(true);
        userResource.resetPassword(cred);

        auditService.record(AuditAction.TEMP_PASSWORD_SET, RESOURCE_USER,
                userId, user.getUsername(), user.getEmail(),
                firstAttr(user, "tenant_id"), null, null, "Temporary password generated");
        return tempPassword;
    }

    public void forcePasswordChangeOnNextLogin(String userId) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();

        List<String> actions = user.getRequiredActions() != null
                ? new java.util.ArrayList<>(user.getRequiredActions())
                : new java.util.ArrayList<>();
        if (!actions.contains("UPDATE_PASSWORD")) {
            actions.add("UPDATE_PASSWORD");
        }
        user.setRequiredActions(actions);
        userResource.update(user);

        auditService.record(AuditAction.PASSWORD_CHANGE_REQUIRED, RESOURCE_USER,
                userId, user.getUsername(), user.getEmail(),
                firstAttr(user, "tenant_id"), null, null, "UPDATE_PASSWORD required action added");
    }

    public void sendPasswordResetEmail(String userId) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();
        try {
            userResource.executeActionsEmail(List.of("UPDATE_PASSWORD"));
            auditService.record(AuditAction.PASSWORD_RESET_EMAIL_SENT, RESOURCE_USER,
                    userId, user.getUsername(), user.getEmail(),
                    firstAttr(user, "tenant_id"), null, null, "Password reset email sent");
        } catch (Exception e) {
            log.warn("Failed to send password reset email for user {}: {}",
                    userId, e.getMessage());
            auditService.recordFailure(AuditAction.PASSWORD_RESET_EMAIL_SENT, RESOURCE_USER,
                    userId, user.getUsername(), user.getEmail(),
                    firstAttr(user, "tenant_id"), null,
                    "SMTP not configured or email delivery failed: " + e.getMessage());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Failed to send password reset email. SMTP may not be configured.");
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Account Locking
    // ═══════════════════════════════════════════════════════════════════

    public void lockAccount(String userId) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();
        user.setEnabled(false);
        userResource.update(user);

        auditService.record(AuditAction.ACCOUNT_LOCKED, RESOURCE_USER,
                userId, user.getUsername(), user.getEmail(),
                firstAttr(user, "tenant_id"), null, "enabled=true", "enabled=false");
    }

    public void unlockAccount(String userId) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();
        user.setEnabled(true);
        userResource.update(user);

        // Also clear brute-force if it was locked that way
        realm().attackDetection().clearBruteForceForUser(userId);

        auditService.record(AuditAction.ACCOUNT_UNLOCKED, RESOURCE_USER,
                userId, user.getUsername(), user.getEmail(),
                firstAttr(user, "tenant_id"), null, "enabled=false", "enabled=true");
    }

    public void clearBruteForceStatus(String userId) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();
        realm().attackDetection().clearBruteForceForUser(userId);

        auditService.record(AuditAction.BRUTE_FORCE_CLEARED, RESOURCE_USER,
                userId, user.getUsername(), user.getEmail(),
                firstAttr(user, "tenant_id"), null, null, "Brute force status cleared");
    }

    // ═══════════════════════════════════════════════════════════════════
    // MFA Management
    // ═══════════════════════════════════════════════════════════════════

    public void requireMfa(String userId) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();

        List<String> actions = user.getRequiredActions() != null
                ? new java.util.ArrayList<>(user.getRequiredActions())
                : new java.util.ArrayList<>();
        if (!actions.contains("CONFIGURE_TOTP")) {
            actions.add("CONFIGURE_TOTP");
        }
        user.setRequiredActions(actions);
        userResource.update(user);

        auditService.record(AuditAction.MFA_REQUIRED, RESOURCE_MFA,
                userId, user.getUsername(), user.getEmail(),
                firstAttr(user, "tenant_id"), null, null, "CONFIGURE_TOTP required action added");
    }

    public void removeMfa(String userId) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();

        // Remove all OTP credentials
        List<org.keycloak.representations.idm.CredentialRepresentation> creds =
                userResource.credentials();
        for (var cred : creds) {
            if ("otp".equals(cred.getType()) || "totp".equals(cred.getType())) {
                userResource.removeCredential(cred.getId());
            }
        }

        // Remove CONFIGURE_TOTP from required actions if present
        List<String> actions = user.getRequiredActions() != null
                ? new java.util.ArrayList<>(user.getRequiredActions())
                : new java.util.ArrayList<>();
        actions.remove("CONFIGURE_TOTP");
        user.setRequiredActions(actions);
        userResource.update(user);

        auditService.record(AuditAction.MFA_REMOVED, RESOURCE_MFA,
                userId, user.getUsername(), user.getEmail(),
                firstAttr(user, "tenant_id"), null, "MFA enabled", "MFA removed");
    }

    public void resetMfaDevices(String userId) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();

        // Remove all OTP credentials
        List<org.keycloak.representations.idm.CredentialRepresentation> creds =
                userResource.credentials();
        for (var cred : creds) {
            if ("otp".equals(cred.getType()) || "totp".equals(cred.getType())) {
                userResource.removeCredential(cred.getId());
            }
        }

        // Force re-registration
        List<String> actions = user.getRequiredActions() != null
                ? new java.util.ArrayList<>(user.getRequiredActions())
                : new java.util.ArrayList<>();
        if (!actions.contains("CONFIGURE_TOTP")) {
            actions.add("CONFIGURE_TOTP");
        }
        user.setRequiredActions(actions);
        userResource.update(user);

        auditService.record(AuditAction.MFA_RESET, RESOURCE_MFA,
                userId, user.getUsername(), user.getEmail(),
                firstAttr(user, "tenant_id"), null, null, "MFA devices reset, re-registration required");
    }

    // ═══════════════════════════════════════════════════════════════════
    // Session Management
    // ═══════════════════════════════════════════════════════════════════

    public List<UserSessionInfo> listSessions(String userId) {
        resolveUser(userId); // validates user exists
        List<UserSessionRepresentation> sessions = realm().users().get(userId).getUserSessions();
        return sessions.stream()
                .map(s -> new UserSessionInfo(
                        s.getId(),
                        // UserSessionRepresentation.start/lastAccess are already epoch
                        // milliseconds (confirmed against the raw Admin REST response —
                        // NOT epoch seconds), so no *1000 conversion here.
                        s.getStart() != 0 ? s.getStart() : null,
                        s.getLastAccess() != 0 ? s.getLastAccess() : null,
                        s.getIpAddress(),
                        s.getClients() != null ? String.join(", ", s.getClients().values()) : null,
                        extractUserAgent(s)
                ))
                .collect(Collectors.toList());
    }

    public void terminateSession(String userId, String sessionId) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();

        realm().deleteSession(sessionId, false);

        auditService.record(AuditAction.SESSION_TERMINATED, RESOURCE_SESSION,
                userId, user.getUsername(), user.getEmail(),
                firstAttr(user, "tenant_id"), null, sessionId, "Session terminated");
    }

    public void terminateAllSessions(String userId) {
        UserResource userResource = resolveUser(userId);
        UserRepresentation user = userResource.toRepresentation();

        userResource.logout();

        auditService.record(AuditAction.ALL_SESSIONS_TERMINATED, RESOURCE_SESSION,
                userId, user.getUsername(), user.getEmail(),
                firstAttr(user, "tenant_id"), null, null, "All sessions terminated");
    }

    // ═══════════════════════════════════════════════════════════════════
    // Login History
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Reads real login/logout events for a user from Keycloak's own event
     * store (realm-acis.json / G6/G7 enables this). If the realm has events
     * disabled, this throws a real 501 rather than returning a fabricated
     * empty list — an empty result must mean "no events happened", not
     * "we never asked Keycloak to record any."
     */
    public List<LoginEventInfo> getLoginEvents(String userId, int limit) {
        resolveUser(userId); // validates user exists

        boolean eventsEnabled = Boolean.TRUE.equals(realm().getRealmEventsConfig().isEventsEnabled());
        if (!eventsEnabled) {
            throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED,
                    "Login event history is not enabled on this realm.");
        }

        List<EventRepresentation> events = realm().getEvents(
                null, null, userId, null, null, null, 0, limit);

        return events.stream()
                .map(e -> new LoginEventInfo(e.getType(), e.getTime(), e.getIpAddress(), e.getError(), e.getClientId()))
                .collect(Collectors.toList());
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════

    private String firstAttr(UserRepresentation user, String key) {
        if (user.getAttributes() == null) return null;
        List<String> values = user.getAttributes().get(key);
        return values != null && !values.isEmpty() ? values.get(0) : null;
    }

    private String generateSecurePassword(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(TEMP_PASSWORD_CHARS.charAt(RANDOM.nextInt(TEMP_PASSWORD_CHARS.length())));
        }
        return sb.toString();
    }

    private String extractUserAgent(UserSessionRepresentation session) {
        // Keycloak 24.x does not expose User-Agent in the Admin REST
        // UserSessionRepresentation. The best we can return is the clients
        // (which hints at the application) — the full User-Agent is only
        // available through Keycloak's internal event system.
        return null;
    }
}
