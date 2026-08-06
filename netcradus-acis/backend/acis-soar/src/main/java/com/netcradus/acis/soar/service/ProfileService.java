package com.netcradus.acis.soar.service;

import com.netcradus.acis.common.rbac.UserMember;
import com.netcradus.acis.common.rbac.UserMemberRepository;
import com.netcradus.acis.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.resource.UserResource;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Real self-service "my own profile" read/write — see ProfileController.
 * Two systems of record, kept in sync on write: UserMember (name/email/
 * phone/department/timezone/notification prefs — this system's own RBAC
 * directory) and Keycloak (name/email are also login identity there, plus
 * MFA/password status, which ONLY Keycloak knows). Unlike admin-driven user
 * management (PlatformUserService), this only ever touches the CALLER's own
 * Keycloak record, resolved from their JWT's sub claim
 * (TenantContext.getUserId()) — never an arbitrary user id from the request.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProfileService {

    private final UserMemberRepository userMemberRepository;
    private final Keycloak keycloakAdminClient;

    @Value("${acis.keycloak.realm}")
    private String realmName;

    public record ProfileView(
            String name, String email, String phone, String department, String timezone,
            boolean mfaEnabled, String passwordLastChangedAt,
            boolean emailNotifications, boolean soundAlerts, boolean criticalOnly) {}

    /**
     * email is deliberately not editable here: UserMemberRepository.
     * findByTenantIdAndEmailIgnoreCase (used throughout RBAC — see
     * PermissionResolver, this class's own currentMember()) resolves "the
     * caller" by matching the JWT's real email claim against this row's
     * email column. Changing the row's email out from under that lookup —
     * confirmed live — orphans the row: the next request's JWT still
     * carries the real (unchanged) Keycloak email, finds no matching row,
     * and auto-provisions a brand new default one, silently discarding
     * everything just saved. A real email change belongs in Keycloak's own
     * account console (self-service, with its own re-verification flow),
     * not this form.
     */
    public record ProfileUpdateRequest(
            String name, String phone, String department, String timezone,
            Boolean emailNotifications, Boolean soundAlerts, Boolean criticalOnly) {}

    @Transactional
    public ProfileView getProfile() {
        UserMember member = currentMember();
        KeycloakStatus kc = fetchKeycloakStatus();
        return new ProfileView(
                member.getName(), member.getEmail(), member.getPhone(), member.getDepartment(), member.getTimezone(),
                kc.mfaEnabled(), kc.passwordLastChangedAt(),
                Boolean.TRUE.equals(member.getEmailNotifications()),
                Boolean.TRUE.equals(member.getSoundAlerts()),
                Boolean.TRUE.equals(member.getCriticalOnly()));
    }

    @Transactional
    public ProfileView updateProfile(ProfileUpdateRequest req) {
        UserMember member = currentMember();
        boolean nameChanged = req.name() != null && !req.name().isBlank() && !req.name().equals(member.getName());

        if (nameChanged) {
            member.setName(req.name());
        }
        member.setPhone(req.phone());
        member.setDepartment(req.department());
        member.setTimezone(req.timezone());
        if (req.emailNotifications() != null) member.setEmailNotifications(req.emailNotifications());
        if (req.soundAlerts() != null) member.setSoundAlerts(req.soundAlerts());
        if (req.criticalOnly() != null) member.setCriticalOnly(req.criticalOnly());
        UserMember saved = userMemberRepository.save(member);

        if (nameChanged) {
            pushIdentityToKeycloak(saved.getName());
        }

        KeycloakStatus kc = fetchKeycloakStatus();
        return new ProfileView(
                saved.getName(), saved.getEmail(), saved.getPhone(), saved.getDepartment(), saved.getTimezone(),
                kc.mfaEnabled(), kc.passwordLastChangedAt(),
                Boolean.TRUE.equals(saved.getEmailNotifications()),
                Boolean.TRUE.equals(saved.getSoundAlerts()),
                Boolean.TRUE.equals(saved.getCriticalOnly()));
    }

    /**
     * Same insert-if-absent-then-read pattern as PermissionResolver.
     * currentMember() — a real login may not have an auto-provisioned
     * UserMember row yet the very first time they open Settings > Profile.
     */
    private UserMember currentMember() {
        UUID tenantId = TenantContext.getTenantIdAsUuid();
        String email = TenantContext.getUserEmail();
        Optional<UserMember> existing = userMemberRepository.findByTenantIdAndEmailIgnoreCase(tenantId, email);
        if (existing.isPresent()) {
            return existing.get();
        }
        userMemberRepository.insertIfAbsent(UUID.randomUUID(), tenantId, email, email, "Active");
        return userMemberRepository.findByTenantIdAndEmailIgnoreCase(tenantId, email)
                .orElseThrow(() -> new IllegalStateException("insertIfAbsent completed but no row found for " + email));
    }

    private record KeycloakStatus(boolean mfaEnabled, String passwordLastChangedAt) {}

    private KeycloakStatus fetchKeycloakStatus() {
        UUID userId = TenantContext.getUserId();
        if (userId == null) {
            return new KeycloakStatus(false, null);
        }
        try {
            List<CredentialRepresentation> credentials = keycloakAdminClient.realm(realmName)
                    .users().get(userId.toString()).credentials();
            boolean mfa = credentials.stream().anyMatch(c -> "otp".equals(c.getType()));
            String passwordChangedAt = credentials.stream()
                    .filter(c -> "password".equals(c.getType()))
                    .map(CredentialRepresentation::getCreatedDate)
                    .filter(java.util.Objects::nonNull)
                    .findFirst()
                    .map(millis -> OffsetDateTime.ofInstant(Instant.ofEpochMilli(millis), ZoneOffset.UTC).toString())
                    .orElse(null);
            return new KeycloakStatus(mfa, passwordChangedAt);
        } catch (RuntimeException e) {
            // Keycloak reachability shouldn't take down the whole profile
            // read — the UserMember half is still real and useful on its own.
            log.warn("Could not read Keycloak credential status for user {}: {}", userId, e.getMessage());
            return new KeycloakStatus(false, null);
        }
    }

    private void pushIdentityToKeycloak(String name) {
        UUID userId = TenantContext.getUserId();
        if (userId == null) {
            return;
        }
        try {
            UserResource userResource = keycloakAdminClient.realm(realmName).users().get(userId.toString());
            UserRepresentation user = userResource.toRepresentation();
            String[] nameParts = splitName(name);
            user.setFirstName(nameParts[0]);
            user.setLastName(nameParts[1]);
            userResource.update(user);
        } catch (RuntimeException e) {
            // The UserMember row (the RBAC-facing record) is already saved —
            // don't fail the whole request over a Keycloak sync hiccup, but
            // don't pretend it worked either.
            log.warn("Failed to push profile name to Keycloak for user {}: {}", userId, e.getMessage());
        }
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
}
