package com.netcradus.acis.common.email;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.io.UnsupportedEncodingException;

/**
 * Real SMTP delivery (Zoho Mail in production — see each consuming
 * service's application.yml spring.mail.* block) for account-activation
 * emails. Shared by acis-soar (inviting an existing tenant's members) and
 * acis-platform-admin (provisioning a brand-new tenant's first admin) so
 * both flows send through the exact same, already-proven mail path rather
 * than maintaining two SMTP integrations. Callers must treat a thrown
 * MessagingException as a genuine failure to report to the admin, never as
 * something to swallow — a link record that silently never reached anyone
 * is worse than an honest error.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${acis.mail.from-email}")
    private String fromEmail;

    @Value("${acis.mail.from-name}")
    private String fromName;

    public void sendInvitationEmail(String toEmail, String toName, String orgName, String acceptUrl) throws MessagingException {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        try {
            helper.setFrom(fromEmail, fromName);
        } catch (UnsupportedEncodingException e) {
            throw new MessagingException("Invalid from-address encoding", e);
        }
        helper.setTo(toEmail);
        helper.setSubject("You're invited to join " + orgName + " on ACIS Security");
        helper.setText(buildInvitationPlainText(toName, orgName, acceptUrl), buildInvitationHtml(toName, orgName, acceptUrl));
        mailSender.send(message);
        log.info("Invitation email sent to {}", toEmail);
    }

    /** The one-time onboarding email a Platform Admin's "New Tenant" action sends to that tenant's first administrator. */
    public void sendTenantActivationEmail(String toEmail, String toName, String tenantName, String activationUrl) throws MessagingException {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        try {
            helper.setFrom(fromEmail, fromName);
        } catch (UnsupportedEncodingException e) {
            throw new MessagingException("Invalid from-address encoding", e);
        }
        helper.setTo(toEmail);
        helper.setSubject("Activate your " + tenantName + " account on ACIS Security");
        helper.setText(buildActivationPlainText(toName, tenantName, activationUrl), buildActivationHtml(toName, tenantName, activationUrl));
        mailSender.send(message);
        log.info("Tenant activation email sent to {}", toEmail);
    }

    private String buildInvitationPlainText(String toName, String orgName, String acceptUrl) {
        return "Hi " + toName + ",\n\n"
                + "You've been invited to join " + orgName + " on ACIS Security.\n\n"
                + "Accept your invitation: " + acceptUrl + "\n\n"
                + "This link expires in 72 hours and can only be used once.\n\n"
                + "If you weren't expecting this invitation, you can safely ignore this email.\n\n"
                + "— ACIS Security";
    }

    private String buildInvitationHtml(String toName, String orgName, String acceptUrl) {
        return "<div style=\"font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;\">"
                + "<h2 style=\"margin-bottom:4px;\">You're invited to join " + escape(orgName) + "</h2>"
                + "<p style=\"color:#555;\">on ACIS Security</p>"
                + "<p>Hi " + escape(toName) + ",</p>"
                + "<p>An administrator has invited you to join their ACIS Security console. Click below to set your password and get started.</p>"
                + "<p style=\"margin:28px 0;\">"
                + "<a href=\"" + acceptUrl + "\" style=\"background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;\">Accept invitation</a>"
                + "</p>"
                + "<p style=\"color:#777;font-size:13px;\">This link expires in 72 hours and can only be used once. "
                + "If the button doesn't work, copy this link into your browser:<br>" + acceptUrl + "</p>"
                + "<p style=\"color:#999;font-size:12px;margin-top:32px;\">If you weren't expecting this invitation, you can safely ignore this email.</p>"
                + "</div>";
    }

    private String buildActivationPlainText(String toName, String tenantName, String activationUrl) {
        return "Hi " + toName + ",\n\n"
                + "An ACIS Security workspace has been created for " + tenantName + ", and you've been named its administrator.\n\n"
                + "Set your password to activate your account: " + activationUrl + "\n\n"
                + "This link expires in 72 hours and can only be used once.\n\n"
                + "If you weren't expecting this, you can safely ignore this email.\n\n"
                + "— ACIS Security";
    }

    private String buildActivationHtml(String toName, String tenantName, String activationUrl) {
        return "<div style=\"font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;\">"
                + "<h2 style=\"margin-bottom:4px;\">Your " + escape(tenantName) + " workspace is ready</h2>"
                + "<p style=\"color:#555;\">on ACIS Security</p>"
                + "<p>Hi " + escape(toName) + ",</p>"
                + "<p>An ACIS Security workspace has been created for <strong>" + escape(tenantName)
                + "</strong>, and you've been named its administrator. Click below to set your password and activate your account.</p>"
                + "<p style=\"margin:28px 0;\">"
                + "<a href=\"" + activationUrl + "\" style=\"background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;\">Activate account</a>"
                + "</p>"
                + "<p style=\"color:#777;font-size:13px;\">This link expires in 72 hours and can only be used once. "
                + "If the button doesn't work, copy this link into your browser:<br>" + activationUrl + "</p>"
                + "<p style=\"color:#999;font-size:12px;margin-top:32px;\">If you weren't expecting this, you can safely ignore this email.</p>"
                + "</div>";
    }

    private String escape(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
