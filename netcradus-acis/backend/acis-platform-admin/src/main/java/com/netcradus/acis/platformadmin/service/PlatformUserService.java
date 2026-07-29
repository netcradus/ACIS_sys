package com.netcradus.acis.platformadmin.service;

import com.netcradus.acis.platformadmin.audit.AuditAction;
import com.netcradus.acis.platformadmin.audit.PlatformAuditService;
import com.netcradus.acis.platformadmin.dto.PlatformUserDetail;
import com.netcradus.acis.platformadmin.dto.PlatformUserSummary;
import com.netcradus.acis.platformadmin.exception.CompanyAdminConflictException;
import com.netcradus.acis.platformadmin.model.Tenant;
import com.netcradus.acis.platformadmin.repository.TenantRepository;
import jakarta.ws.rs.core.Response;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.admin.client.CreatedResponseUtil;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.resource.RealmResource;
import org.keycloak.admin.client.resource.UserResource;
import org.keycloak.representations.idm.CredentialRepresentation;
import org.keycloak.representations.idm.RoleRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class PlatformUserService {

    /** Tenant-scoped ownership role — see CompanyAdminConflictException for the uniqueness rule. */
    public static final String COMPANY_ADMIN_ROLE = "company-admin";
    private static final String TENANT_ID_ATTRIBUTE = "tenant_id";
    private static final int PAGE_SIZE = 100;
    private static final int USER_COUNT_WARNING_THRESHOLD = 1000;

    private final Keycloak keycloak;
    private final TenantRepository tenantRepository;
    private final PlatformAuditService auditService;

    @Value("${acis.keycloak.realm}")
    private String realmName;

    // Per-tenant lock for the Company-Admin check-then-assign race. Sufficient
    // for this single-instance ops console — see plan notes on why a
    // cross-instance constraint (a small DB table) is not built here.
    private final Map<String, Object> tenantLocks = new ConcurrentHashMap<>();
    private final ExecutorService roleFetchPool = Executors.newFixedThreadPool(16);

    private RealmResource realm() {
        return keycloak.realm(realmName);
    }

    public List<PlatformUserSummary> listUsers() {
        List<UserRepresentation> allUsers = fetchAllUsers();
        if (allUsers.size() > USER_COUNT_WARNING_THRESHOLD) {
            log.warn("Platform user count ({}) exceeds the per-request enrichment threshold ({}); " +
                    "list latency will grow linearly until a cached read-model is built.",
                    allUsers.size(), USER_COUNT_WARNING_THRESHOLD);
        }

        Map<UUID, Tenant> tenantsById = tenantRepository.findAll().stream()
                .collect(Collectors.toMap(Tenant::getId, t -> t));

        List<CompletableFuture<PlatformUserSummary>> futures = allUsers.stream()
                .map(user -> CompletableFuture.supplyAsync(() -> toSummary(user, tenantsById), roleFetchPool))
                .collect(Collectors.toList());

        return futures.stream().map(CompletableFuture::join).collect(Collectors.toList());
    }

    private List<UserRepresentation> fetchAllUsers() {
        List<UserRepresentation> all = new ArrayList<>();
        int first = 0;
        while (true) {
            List<UserRepresentation> page = realm().users().list(first, PAGE_SIZE);
            all.addAll(page);
            if (page.size() < PAGE_SIZE) {
                break;
            }
            first += PAGE_SIZE;
        }
        return all;
    }

    private PlatformUserSummary toSummary(UserRepresentation user, Map<UUID, Tenant> tenantsById) {
        List<String> roles = realm().users().get(user.getId()).roles().realmLevel().listAll().stream()
                .map(RoleRepresentation::getName)
                .collect(Collectors.toList());
        String tenantId = firstAttribute(user, TENANT_ID_ATTRIBUTE);
        String tenantName = resolveTenantName(tenantId, tenantsById);
        return new PlatformUserSummary(
                user.getId(), user.getUsername(), user.getEmail(), user.getFirstName(), user.getLastName(),
                Boolean.TRUE.equals(user.isEnabled()), tenantId, tenantName, roles,
                Boolean.TRUE.equals(user.isTotp()), user.getCreatedTimestamp()
        );
    }

    private String resolveTenantName(String tenantId, Map<UUID, Tenant> tenantsById) {
        if (tenantId == null || tenantId.isBlank()) {
            return null;
        }
        try {
            Tenant tenant = tenantsById.get(UUID.fromString(tenantId));
            return tenant != null ? tenant.getName() : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    public PlatformUserDetail getUserDetail(String userId) {
        UserResource userResource = resolveUserResource(userId);
        UserRepresentation user = userResource.toRepresentation();

        List<String> roles = userResource.roles().realmLevel().listAll().stream()
                .map(RoleRepresentation::getName)
                .collect(Collectors.toList());

        String tenantId = firstAttribute(user, TENANT_ID_ATTRIBUTE);
        Tenant tenant = tenantId != null && !tenantId.isBlank()
                ? tenantRepository.findById(safeUuid(tenantId)).orElse(null)
                : null;

        Map<String, Object> bruteForceStatus = realm().attackDetection().bruteForceUserStatus(userId);
        boolean locked = Boolean.TRUE.equals(bruteForceStatus.get("disabled"));
        int failedAttempts = bruteForceStatus.get("numFailures") instanceof Number n ? n.intValue() : 0;

        return new PlatformUserDetail(
                user.getId(), user.getUsername(), user.getEmail(), user.getFirstName(), user.getLastName(),
                Boolean.TRUE.equals(user.isEnabled()), tenantId, tenant != null ? tenant.getName() : null,
                roles, Boolean.TRUE.equals(user.isTotp()),
                user.getRequiredActions() != null ? user.getRequiredActions() : List.of(),
                user.getCreatedTimestamp(), locked, failedAttempts
        );
    }

    public record CreateUserRequest(
            String tenantId, String username, String email, String firstName, String lastName,
            String tempPassword, boolean forcePasswordResetNextLogin, List<String> initialRoles) {
    }

    public String createUser(CreateUserRequest req) {
        if (req.username() == null || req.username().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "username is required");
        }
        if (req.tenantId() == null || tenantRepository.findById(safeUuid(req.tenantId())).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid tenantId is required");
        }

        UserRepresentation user = new UserRepresentation();
        user.setUsername(req.username());
        user.setEmail(req.email());
        user.setFirstName(req.firstName());
        user.setLastName(req.lastName());
        user.setEnabled(true);
        user.setEmailVerified(true);
        user.setAttributes(Map.of(TENANT_ID_ATTRIBUTE, List.of(req.tenantId())));

        if (req.tempPassword() != null && !req.tempPassword().isBlank()) {
            CredentialRepresentation credential = new CredentialRepresentation();
            credential.setType(CredentialRepresentation.PASSWORD);
            credential.setValue(req.tempPassword());
            credential.setTemporary(req.forcePasswordResetNextLogin());
            user.setCredentials(List.of(credential));
        }

        try (Response response = realm().users().create(user)) {
            if (response.getStatus() != 201) {
                throw new ResponseStatusException(HttpStatus.valueOf(response.getStatus()),
                        "Keycloak rejected user creation");
            }
            String newUserId = CreatedResponseUtil.getCreatedId(response);
            String tenantName = tenantNameOrNull(req.tenantId());

            if (req.initialRoles() != null && !req.initialRoles().isEmpty()) {
                try {
                    for (String roleName : req.initialRoles()) {
                        assignRole(newUserId, roleName);
                    }
                } catch (RuntimeException e) {
                    // Keycloak user creation + role assignment isn't one transaction —
                    // roll back the just-created user rather than leave an orphaned
                    // account with none of its intended roles.
                    log.warn("Rolling back user {} after initial role assignment failed: {}", newUserId, e.getMessage());
                    try (Response ignored = realm().users().delete(newUserId)) {
                        // best-effort cleanup
                    }
                    auditService.recordFailure(AuditAction.USER_CREATED, "USER", newUserId, req.username(), req.email(),
                            req.tenantId(), tenantName, "Rolled back: initial role assignment failed - " + e.getMessage());
                    throw e;
                }
            }
            auditService.record(AuditAction.USER_CREATED, "USER", newUserId, req.username(), req.email(),
                    req.tenantId(), tenantName, null, req.username());
            return newUserId;
        }
    }

    public record UpdateUserRequest(String username, String email, String firstName, String lastName) {
    }

    public void updateProfile(String userId, UpdateUserRequest req) {
        UserResource userResource = resolveUserResource(userId);
        UserRepresentation user = userResource.toRepresentation();
        String tenantId = firstAttribute(user, TENANT_ID_ATTRIBUTE);
        String previousValue = String.format("username=%s, email=%s, firstName=%s, lastName=%s",
                user.getUsername(), user.getEmail(), user.getFirstName(), user.getLastName());

        if (req.username() != null) user.setUsername(req.username());
        if (req.email() != null) user.setEmail(req.email());
        if (req.firstName() != null) user.setFirstName(req.firstName());
        if (req.lastName() != null) user.setLastName(req.lastName());
        userResource.update(user);

        String newValue = String.format("username=%s, email=%s, firstName=%s, lastName=%s",
                user.getUsername(), user.getEmail(), user.getFirstName(), user.getLastName());
        auditService.record(AuditAction.USER_UPDATED, "USER", userId, user.getUsername(), user.getEmail(),
                tenantId, tenantNameOrNull(tenantId), previousValue, newValue);
    }

    public void deleteUser(String userId) {
        UserRepresentation user = resolveUserResource(userId).toRepresentation();
        String tenantId = firstAttribute(user, TENANT_ID_ATTRIBUTE);

        try (Response response = realm().users().delete(userId)) {
            if (response.getStatus() >= 400) {
                auditService.recordFailure(AuditAction.USER_DELETED, "USER", userId, user.getUsername(), user.getEmail(),
                        tenantId, tenantNameOrNull(tenantId), "Keycloak returned status " + response.getStatus());
                throw new ResponseStatusException(HttpStatus.valueOf(response.getStatus()), "Failed to delete user");
            }
        }
        auditService.record(AuditAction.USER_DELETED, "USER", userId, user.getUsername(), user.getEmail(),
                tenantId, tenantNameOrNull(tenantId), null, null);
    }

    public void setEnabled(String userId, boolean enabled) {
        UserResource userResource = resolveUserResource(userId);
        UserRepresentation user = userResource.toRepresentation();
        user.setEnabled(enabled);
        userResource.update(user);

        String tenantId = firstAttribute(user, TENANT_ID_ATTRIBUTE);
        auditService.record(enabled ? AuditAction.USER_ACTIVATED : AuditAction.USER_DEACTIVATED, "USER",
                userId, user.getUsername(), user.getEmail(), tenantId, tenantNameOrNull(tenantId), null, null);
    }

    public void moveTenant(String userId, String newTenantId) {
        if (tenantRepository.findById(safeUuid(newTenantId)).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown target tenant: " + newTenantId);
        }
        UserResource userResource = resolveUserResource(userId);
        UserRepresentation user = userResource.toRepresentation();
        String previousTenantId = firstAttribute(user, TENANT_ID_ATTRIBUTE);

        List<String> currentRoles = userResource.roles().realmLevel().listAll().stream()
                .map(RoleRepresentation::getName)
                .collect(Collectors.toList());
        if (currentRoles.contains(COMPANY_ADMIN_ROLE)) {
            // Company Admin ownership is scoped to the tenant being left — it does not travel with the user.
            removeRole(userId, COMPANY_ADMIN_ROLE);
        }

        user.setAttributes(Map.of(TENANT_ID_ATTRIBUTE, List.of(newTenantId)));
        userResource.update(user);

        auditService.record(AuditAction.USER_MOVED_TENANT, "USER", userId, user.getUsername(), user.getEmail(),
                newTenantId, tenantNameOrNull(newTenantId), tenantNameOrNull(previousTenantId), tenantNameOrNull(newTenantId));
    }

    public List<String> listUserRoles(String userId) {
        return resolveUserResource(userId).roles().realmLevel().listAll().stream()
                .map(RoleRepresentation::getName)
                .collect(Collectors.toList());
    }

    public void assignRole(String userId, String roleName) {
        UserResource userResource = resolveUserResource(userId);
        UserRepresentation user = userResource.toRepresentation();
        String tenantId = firstAttribute(user, TENANT_ID_ATTRIBUTE);

        if (COMPANY_ADMIN_ROLE.equals(roleName)) {
            if (tenantId == null || tenantId.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "User must be assigned to a tenant before being granted Company Admin.");
            }
            synchronized (tenantLocks.computeIfAbsent(tenantId, k -> new Object())) {
                assertNoOtherCompanyAdmin(tenantId, userId);
                RoleRepresentation role = realm().roles().get(COMPANY_ADMIN_ROLE).toRepresentation();
                userResource.roles().realmLevel().add(List.of(role));
            }
            auditService.record(AuditAction.ROLE_ASSIGNED, "USER", userId, user.getUsername(), user.getEmail(),
                    tenantId, tenantNameOrNull(tenantId), null, COMPANY_ADMIN_ROLE);
            return;
        }

        RoleRepresentation role = realm().roles().get(roleName).toRepresentation();
        userResource.roles().realmLevel().add(List.of(role));
        auditService.record(AuditAction.ROLE_ASSIGNED, "USER", userId, user.getUsername(), user.getEmail(),
                tenantId, tenantNameOrNull(tenantId), null, roleName);
    }

    private void assertNoOtherCompanyAdmin(String tenantId, String userId) {
        List<UserRepresentation> members = realm().roles().get(COMPANY_ADMIN_ROLE).getUserMembers(0, 1000);
        for (UserRepresentation member : members) {
            if (member.getId().equals(userId)) {
                continue;
            }
            String memberTenantId = firstAttribute(member, TENANT_ID_ATTRIBUTE);
            if (tenantId.equals(memberTenantId)) {
                throw new CompanyAdminConflictException(member.getEmail() != null ? member.getEmail() : member.getUsername());
            }
        }
    }

    public void removeRole(String userId, String roleName) {
        UserResource userResource = resolveUserResource(userId);
        UserRepresentation user = userResource.toRepresentation();
        String tenantId = firstAttribute(user, TENANT_ID_ATTRIBUTE);

        RoleRepresentation role = realm().roles().get(roleName).toRepresentation();
        userResource.roles().realmLevel().remove(List.of(role));

        auditService.record(AuditAction.ROLE_REMOVED, "USER", userId, user.getUsername(), user.getEmail(),
                tenantId, tenantNameOrNull(tenantId), roleName, null);
    }

    private UserResource resolveUserResource(String userId) {
        UserResource resource = realm().users().get(userId);
        try {
            resource.toRepresentation();
        } catch (jakarta.ws.rs.NotFoundException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown user: " + userId);
        }
        return resource;
    }

    private String tenantNameOrNull(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            return null;
        }
        try {
            return tenantRepository.findById(UUID.fromString(tenantId)).map(Tenant::getName).orElse(null);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String firstAttribute(UserRepresentation user, String key) {
        if (user.getAttributes() == null) {
            return null;
        }
        List<String> values = user.getAttributes().get(key);
        return values != null && !values.isEmpty() ? values.get(0) : null;
    }

    private static UUID safeUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid tenant id: " + value);
        }
    }
}
