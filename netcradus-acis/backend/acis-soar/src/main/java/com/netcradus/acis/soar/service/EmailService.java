package com.netcradus.acis.soar.service;

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
 * Real SMTP delivery (Zoho Mail in production — see application.yml's
 * spring.mail.* block) for invitation emails. Deliberately narrow: this is
 * the one email this system sends today. Callers (InvitationService) must
 * treat a thrown MessagingException as a genuine failure to report to the
 * admin, never as something to swallow — an invite record that silently
 * never reached anyone is worse than an honest error.
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
        // multipart=true is required for the setText(plain, html) overload below
        // (a plain-text + HTML alternative) — false would throw at send time.
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        try {
            helper.setFrom(fromEmail, fromName);
        } catch (UnsupportedEncodingException e) {
            throw new MessagingException("Invalid from-address encoding", e);
        }
        helper.setTo(toEmail);
        helper.setSubject("You're invited to join " + orgName + " on ACIS Security");
        helper.setText(buildPlainText(toName, orgName, acceptUrl), buildHtml(toName, orgName, acceptUrl));
        mailSender.send(message);
        log.info("Invitation email sent to {}", toEmail);
    }

    private String buildPlainText(String toName, String orgName, String acceptUrl) {
        return "Hi " + toName + ",\n\n"
                + "You've been invited to join " + orgName + " on ACIS Security.\n\n"
                + "Accept your invitation: " + acceptUrl + "\n\n"
                + "This link expires in 72 hours and can only be used once.\n\n"
                + "If you weren't expecting this invitation, you can safely ignore this email.\n\n"
                + "— ACIS Security";
    }

    private String buildHtml(String toName, String orgName, String acceptUrl) {
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

    private String escape(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
