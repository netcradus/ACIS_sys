package com.netcradus.acis.platformadmin.service;

import com.netcradus.acis.common.email.EmailService;
import com.netcradus.acis.platformadmin.audit.AuditAction;
import com.netcradus.acis.platformadmin.audit.PlatformAuditService;
import com.netcradus.acis.platformadmin.model.Tenant;
import com.netcradus.acis.platformadmin.model.TenantActivation;
import com.netcradus.acis.platformadmin.repository.TenantActivationRepository;
import com.netcradus.acis.platformadmin.repository.TenantRepository;
import jakarta.mail.MessagingException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * Real onboarding-link issuance and acceptance for a brand-new tenant's
 * first administrator — the counterpart to acis-soar's InvitationService,
 * but for provisioning a tenant's very first user (who has no
 * UserMember/console-role context yet) rather than inviting an additional
 * member into an already-running one. Same secure token scheme (random
 * opaque value, SHA-256 hash persisted, raw value shown exactly once, in
 * the email only) and the same "account created only at accept time"
 * philosophy: nothing logs in until the recipient actually clicks the link
 * and sets a password.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TenantActivationService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final String CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int EXPIRY_HOURS = 72;

    private final TenantActivationRepository activationRepository;
    private final TenantRepository tenantRepository;
    private final EmailService emailService;
    private final PlatformUserService platformUserService;
    private final PlatformAuditService auditService;

    @Value("${acis.frontend-url}")
    private String frontendUrl;

    public static class InvalidActivationException extends RuntimeException {
        public InvalidActivationException(String message) {
            super(message);
        }
    }

    public record IssueResult(TenantActivation activation, boolean emailSent, String emailError) {}

    /**
     * Issues a fresh onboarding link for a just-created tenant and sends
     * the real email. Any previously-outstanding activation for the same
     * tenant is expired immediately — only one link should ever be live at
     * a time, so an old email can't be replayed after a resend.
     */
    @Transactional
    public IssueResult issue(Tenant tenant, String adminName, String adminEmail) {
        activationRepository.findByTenantIdOrderByCreatedAtDesc(tenant.getId()).stream()
                .filter(TenantActivation::isValid)
                .forEach(existing -> {
                    existing.setExpiresAt(OffsetDateTime.now());
                    activationRepository.save(existing);
                });

        String rawToken = generateToken();
        TenantActivation activation = new TenantActivation();
        activation.setTenantId(tenant.getId());
        activation.setAdminName(adminName);
        activation.setAdminEmail(adminEmail);
        activation.setTokenHash(hashToken(rawToken));
        activation.setExpiresAt(OffsetDateTime.now().plusHours(EXPIRY_HOURS));
        TenantActivation saved = activationRepository.save(activation);

        String activationUrl = frontendUrl + "/activate-tenant?token=" + rawToken;

        boolean sent = false;
        String error = null;
        try {
            emailService.sendTenantActivationEmail(adminEmail, adminName, tenant.getName(), activationUrl);
            sent = true;
            auditService.record(AuditAction.TENANT_ACTIVATION_SENT, "TENANT", null, null, adminEmail,
                    tenant.getId().toString(), tenant.getName(), null, "sent to " + adminEmail);
        } catch (MessagingException | RuntimeException e) {
            log.warn("Tenant activation email to {} failed to send: {}", adminEmail, e.getMessage());
            error = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            auditService.recordFailure(AuditAction.TENANT_ACTIVATION_SENT, "TENANT", null, null, adminEmail,
                    tenant.getId().toString(), tenant.getName(), error);
        }
        return new IssueResult(saved, sent, error);
    }

    public record ActivationPreview(String tenantName, String adminName, String adminEmail) {}

    public ActivationPreview preview(String rawToken) {
        TenantActivation activation = findValid(rawToken);
        String tenantName = tenantRepository.findById(activation.getTenantId())
                .map(Tenant::getName)
                .orElse("your organization");
        return new ActivationPreview(tenantName, activation.getAdminName(), activation.getAdminEmail());
    }

    /**
     * Consumes the token: creates the real Keycloak account (only now —
     * see class Javadoc) with roles admin+company-admin, matching
     * TenantSignupController's convention for a tenant's first user, then
     * marks the activation consumed.
     */
    @Transactional
    public void accept(String rawToken, String password) {
        TenantActivation activation = findValid(rawToken);

        String[] nameParts = splitName(activation.getAdminName());
        String userId = platformUserService.createUser(new PlatformUserService.CreateUserRequest(
                activation.getTenantId().toString(),
                activation.getAdminEmail(),
                activation.getAdminEmail(),
                nameParts[0],
                nameParts[1],
                password,
                false,
                List.of("admin", "company-admin"),
                false));

        activation.setConsumedAt(OffsetDateTime.now());
        activationRepository.save(activation);

        auditService.record(AuditAction.TENANT_ADMIN_ACTIVATED, "USER", userId, activation.getAdminEmail(),
                activation.getAdminEmail(), activation.getTenantId().toString(), null, null,
                "activated via onboarding link");
    }

    private TenantActivation findValid(String rawToken) {
        String hash = hashToken(rawToken);
        TenantActivation activation = activationRepository.findByTokenHash(hash).orElse(null);
        if (activation == null || !activation.isValid()) {
            throw new InvalidActivationException("This activation link is invalid or has expired.");
        }
        return activation;
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
