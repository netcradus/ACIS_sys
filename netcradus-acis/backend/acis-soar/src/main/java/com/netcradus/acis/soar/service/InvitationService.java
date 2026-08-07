package com.netcradus.acis.soar.service;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.email.EmailService;
import com.netcradus.acis.common.rbac.UserMember;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.soar.model.Invitation;
import com.netcradus.acis.soar.model.Organization;
import com.netcradus.acis.soar.repository.InvitationRepository;
import com.netcradus.acis.soar.repository.OrganizationRepository;
import jakarta.mail.MessagingException;
import jakarta.ws.rs.core.Response;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.resource.RealmResource;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Real invite-link issuance and acceptance. Mirrors ApiKeyIssuer's token
 * scheme (random opaque token, SHA-256 hash persisted, raw value shown
 * exactly once) and TenantSignupController/PlatformUserService's pattern for
 * provisioning a Keycloak account — except here the account is deliberately
 * NOT created at invite time. Per the product decision, no login exists for
 * an invited member until they actually click the link and set a password;
 * until then all that's real is the Invitation row and the UserMember
 * placeholder (status "Invited").
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class InvitationService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final String CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int EXPIRY_HOURS = 72;

    private final InvitationRepository invitationRepository;
    private final OrganizationRepository organizationRepository;
    private final EmailService emailService;
    private final Keycloak keycloakAdminClient;
    private final AuditEventPublisher auditEventPublisher;
    private final JdbcTemplate jdbcTemplate;

    @Value("${acis.keycloak.realm}")
    private String realmName;

    @Value("${acis.frontend-url}")
    private String frontendUrl;

    public static class InvalidInvitationException extends RuntimeException {
        public InvalidInvitationException(String message) {
            super(message);
        }
    }

    public record IssueResult(Invitation invitation, boolean emailSent, String emailError) {}

    /**
     * Issues a fresh invite for an already-persisted UserMember (status
     * "Invited") and sends the real email. Any previously-outstanding
     * invitation for the same member is expired immediately — only one
     * link should ever be live at a time, so an old email can't be replayed
     * after a resend. Runs as part of an ordinary authenticated admin
     * request, so TenantContext is already correctly set for the whole
     * request by TenantContextFilter — none of the bypass/reconnection
     * concerns below apply here.
     */
    @Transactional
    public IssueResult issue(UserMember member) {
        invitationRepository.findByUserMemberId(member.getId()).stream()
                .filter(inv -> inv.getConsumedAt() == null && inv.getExpiresAt().isAfter(OffsetDateTime.now()))
                .forEach(inv -> {
                    inv.setExpiresAt(OffsetDateTime.now());
                    invitationRepository.save(inv);
                });

        String rawToken = generateToken();
        Invitation invitation = new Invitation();
        invitation.setTenantId(member.getTenantId());
        invitation.setUserMember(member);
        invitation.setTokenHash(hashToken(rawToken));
        invitation.setExpiresAt(OffsetDateTime.now().plusHours(EXPIRY_HOURS));
        Invitation saved = invitationRepository.save(invitation);

        String acceptUrl = frontendUrl + "/accept-invite?token=" + rawToken;
        String orgName = organizationRepository.findByTenantId(member.getTenantId()).stream()
                .findFirst().map(Organization::getName).orElse("ACIS Security");

        boolean sent = false;
        String error = null;
        try {
            emailService.sendInvitationEmail(member.getEmail(), member.getName(), orgName, acceptUrl);
            sent = true;
        } catch (MessagingException | RuntimeException e) {
            log.warn("Invitation email to {} failed to send: {}", member.getEmail(), e.getMessage());
            error = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
        }
        return new IssueResult(saved, sent, error);
    }

    public record InvitationPreview(String inviteeName, String inviteeEmail, String orgName) {}

    private record MemberRow(UUID id, String name, String email) {}

    /**
     * Public lookup — no JWT, no tenant known yet. See
     * TenantContext.setInvitationLookupInProgress and the matching RLS
     * policy (RlsConfig) for why the first step (findValid) is safe: only
     * the invitations table's policy honors that bypass, and only for that
     * one read.
     *
     * Everything AFTER the tenant is known runs as raw JDBC on one
     * explicitly-held Connection (loadMember/writeAcceptance below),
     * deliberately not through the JPA repositories or TenantContext at
     * all. Confirmed live: Open-Session-In-View hands the whole HTTP
     * request a single physical JDBC connection, acquired once (by
     * findValid()'s bypass lookup — the first query of the request) and
     * reused for every later Hibernate query in the same request
     * regardless of @Transactional boundaries, including
     * Propagation.REQUIRES_NEW (tried first; still handed back the same
     * connection). That means neither "set TenantContext before the next
     * repository call" nor "start a nested transaction" changes which
     * connection Hibernate actually queries with — the GUC set at the very
     * first checkout (empty tenant, bypass on) stays in effect for the
     * rest of the request no matter what. Operating on an explicitly
     * obtained Connection instead sidesteps that ambiguity entirely: the
     * GUC is set and the query run in the same callback, on the same
     * connection, guaranteed.
     */
    public InvitationPreview preview(String rawToken) {
        Invitation invitation = findValid(rawToken);
        UUID memberId = invitation.getUserMember().getId();
        UUID tenantId = invitation.getTenantId();

        return jdbcTemplate.execute((Connection connection) -> {
            setTenantGuc(connection, tenantId);
            MemberRow member = loadMember(connection, tenantId, memberId);
            String orgName = organizationRepository.findByTenantId(tenantId).stream()
                    .findFirst().map(Organization::getName).orElse("ACIS Security");
            return new InvitationPreview(member.name(), member.email(), orgName);
        });
    }

    /**
     * Consumes the token: creates the real Keycloak login (only now — see
     * class Javadoc), activates the UserMember, marks the invitation
     * consumed. If Keycloak account creation fails, neither write happens
     * and the caller can retry with the same still-valid link. See
     * preview()'s Javadoc for why the member load and the final writes go
     * through raw JDBC rather than the JPA repositories.
     */
    public void accept(String rawToken, String password) {
        Invitation invitation = findValid(rawToken);
        UUID memberId = invitation.getUserMember().getId();
        UUID tenantId = invitation.getTenantId();
        UUID invitationId = invitation.getId();

        MemberRow member = jdbcTemplate.execute((Connection connection) -> {
            setTenantGuc(connection, tenantId);
            return loadMember(connection, tenantId, memberId);
        });

        provisionKeycloakAccount(member, tenantId, password);

        jdbcTemplate.execute((Connection connection) -> {
            setTenantGuc(connection, tenantId);
            try (PreparedStatement ps = connection.prepareStatement(
                    "UPDATE user_members SET status = 'Active', last_login = 'Never' WHERE id = ? AND tenant_id = ?")) {
                ps.setObject(1, memberId);
                ps.setObject(2, tenantId);
                ps.executeUpdate();
            }
            try (PreparedStatement ps = connection.prepareStatement(
                    "UPDATE invitations SET consumed_at = now() WHERE id = ? AND tenant_id = ?")) {
                ps.setObject(1, invitationId);
                ps.setObject(2, tenantId);
                ps.executeUpdate();
            }
            return null;
        });

        auditEventPublisher.publish("USER_ACCEPT_INVITE", "user/" + member.id(), "email=" + member.email());
    }

    private void setTenantGuc(Connection connection, UUID tenantId) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement("SELECT set_config('app.current_tenant_id', ?, false)")) {
            ps.setString(1, tenantId.toString());
            ps.execute();
        }
    }

    private MemberRow loadMember(Connection connection, UUID tenantId, UUID memberId) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT id, name, email FROM user_members WHERE id = ? AND tenant_id = ?")) {
            ps.setObject(1, memberId);
            ps.setObject(2, tenantId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw new InvalidInvitationException("This invitation is no longer valid.");
                }
                return new MemberRow(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("email"));
            }
        }
    }

    /** No DB access — a plain remote Keycloak Admin REST call, so no transaction/tenant-GUC concerns apply here. */
    private void provisionKeycloakAccount(MemberRow member, UUID tenantId, String password) {
        UserRepresentation kcUser = new UserRepresentation();
        kcUser.setUsername(member.email());
        kcUser.setEmail(member.email());
        String[] nameParts = splitName(member.name());
        kcUser.setFirstName(nameParts[0]);
        kcUser.setLastName(nameParts[1]);
        kcUser.setEnabled(true);
        // Clicking the emailed link IS the proof of ownership here — no
        // separate Keycloak VERIFY_EMAIL required-action needed on top.
        kcUser.setEmailVerified(true);
        kcUser.setAttributes(Map.of("tenant_id", List.of(tenantId.toString())));

        CredentialRepresentation credential = new CredentialRepresentation();
        credential.setType(CredentialRepresentation.PASSWORD);
        credential.setValue(password);
        credential.setTemporary(false);
        kcUser.setCredentials(List.of(credential));

        RealmResource realm = keycloakAdminClient.realm(realmName);
        try (Response response = realm.users().create(kcUser)) {
            if (response.getStatus() == 409) {
                throw new InvalidInvitationException(
                        "An account for this email already exists. Try logging in instead.");
            }
            if (response.getStatus() != 201) {
                throw new IllegalStateException("Keycloak rejected account creation (status " + response.getStatus() + ")");
            }
        }
    }

    private Invitation findValid(String rawToken) {
        String hash = hashToken(rawToken);
        Invitation invitation;
        try {
            TenantContext.setInvitationLookupInProgress(true);
            invitation = invitationRepository.findByTokenHash(hash).orElse(null);
        } finally {
            TenantContext.setInvitationLookupInProgress(false);
        }
        if (invitation == null || !invitation.isValid()) {
            throw new InvalidInvitationException("This invitation link is invalid or has expired.");
        }
        return invitation;
    }

    private static String[] splitName(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return new String[] { "", "" };
        }
        int spaceIndex = fullName.indexOf(' ');
        if (spaceIndex < 0) {
            return new String[] { fullName, "" };
        }
        return new String[] { fullName.substring(0, spaceIndex), fullName.substring(spaceIndex + 1).trim() };
    }

    private String generateToken() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 48; i++) {
            sb.append(CHARS.charAt(SECURE_RANDOM.nextInt(CHARS.length())));
        }
        return sb.toString();
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
