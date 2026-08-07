package com.netcradus.acis.common.rbac;

import com.netcradus.acis.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Resolves what the currently-authenticated caller (from TenantContext,
 * populated by TenantContextFilter from their validated JWT) can actually do
 * — the piece that was entirely missing before: UserMember had no link to a
 * ConsoleRole, so there was no way to answer "what can THIS person do" even
 * though the role/permission data itself was real. Deny-by-default
 * throughout: no member row, no assigned role, or no explicit permission row
 * for a module all resolve to NONE, never an assumed default access level.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PermissionResolver {

    private final UserMemberRepository userMemberRepository;
    private final DefaultRoleProvisioner defaultRoleProvisioner;

    /**
     * @Transactional matters here specifically because this is called from
     * RbacEnforcementFilter — a plain Servlet Filter that runs before Spring
     * MVC's Open-Session-In-View support ever opens a session, unlike a
     * normal controller method. Without an explicit transaction of its own,
     * accessing the lazy UserMember.role proxy below throws
     * LazyInitializationException ("no Session") outside of one. Not
     * readOnly: auto-provisioning (see currentMember) can write, and Postgres
     * rejects writes inside a connection Spring has marked read-only.
     */
    @Transactional
    public PermissionLevel resolve(String moduleName) {
        Optional<UserMember> member = currentMember();
        if (member.isEmpty()) return PermissionLevel.NONE;
        ConsoleRole role = member.get().getRole();
        if (role == null || role.getPermissions() == null) return PermissionLevel.NONE;
        return role.getPermissions().stream()
                .filter(p -> moduleName.equals(p.getModuleName()))
                .findFirst()
                .map(p -> PermissionLevel.fromString(p.getPermissionLevel()))
                .orElse(PermissionLevel.NONE);
    }

    /**
     * Every module the caller's role has an explicit entry for — used by GET
     * /api/soar/settings/my-permissions to drive frontend gating. Filtered to
     * DefaultRoleProvisioner.MODULES so a role provisioned before a module
     * was retired (e.g. the old standalone "Dashboard" entry) doesn't leak a
     * stale key the frontend no longer checks for.
     */
    @Transactional
    public Map<String, PermissionLevel> resolveAll() {
        Map<String, PermissionLevel> result = new LinkedHashMap<>();
        Optional<UserMember> member = currentMember();
        if (member.isEmpty()) return result;
        ConsoleRole role = member.get().getRole();
        if (role == null || role.getPermissions() == null) return result;
        java.util.Set<String> currentModules = java.util.Set.of(DefaultRoleProvisioner.MODULES);
        role.getPermissions().stream()
                .filter(p -> currentModules.contains(p.getModuleName()))
                .forEach(p -> result.put(p.getModuleName(), PermissionLevel.fromString(p.getPermissionLevel())));
        return result;
    }

    /**
     * First-time-seen real logins are auto-provisioned here rather than
     * silently denied forever — there was previously no path that ever
     * created a UserMember for an actual authenticated Keycloak user (only
     * for tenant-admin-entered directory rows in Settings > Users & Groups),
     * so without this, literally every real login would resolve to NONE on
     * every module permanently, with no admin able to log in far enough to
     * fix it. A first-time ADMIN/COMPANY_ADMIN (Keycloak realm role) is
     * auto-assigned Super Admin so a tenant's actual admin always lands with
     * full access; anyone else starts truly role-less (deny-by-default) until
     * an already-provisioned admin assigns them a role in the UI.
     *
     * Uses insert-if-absent (see UserMemberRepository.insertIfAbsent) rather
     * than check-then-insert: a first login typically arrives as a burst of
     * concurrent requests (one page load firing many API calls at once), and
     * a plain check-then-insert lets every one of them see "no row yet"
     * simultaneously and each try to create one — confirmed live: a single
     * page load produced 5 duplicate rows before this fix.
     *
     * The role-less-admin check below runs on EVERY call, not just the row's
     * first-ever creation — confirmed live this was a real, permanent trap:
     * a UserMember whose role ever ends up null (a lost race on a concurrent
     * first login, an admin clearing it, etc.) used to stay role-less
     * forever, since the old code only ever attempted this auto-assignment
     * inside the "just created" branch. An admin correctly editing some
     * OTHER role's permissions would never fix this account, because it was
     * never attached to any role at all — there was nothing to fix short of
     * a manual reassignment via Settings > Users & Groups.
     */
    private Optional<UserMember> currentMember() {
        String tenantIdStr = TenantContext.getTenantId();
        String email = TenantContext.getUserEmail();
        if (tenantIdStr == null || tenantIdStr.isBlank() || email == null || email.isBlank()) {
            return Optional.empty();
        }
        UUID tenantId;
        try {
            tenantId = UUID.fromString(tenantIdStr);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        Optional<UserMember> existing = userMemberRepository.findByTenantIdAndEmailIgnoreCase(tenantId, email);
        UserMember member;
        if (existing.isPresent()) {
            member = existing.get();
        } else {
            userMemberRepository.insertIfAbsent(UUID.randomUUID(), tenantId, email, email, "Active");
            member = userMemberRepository.findByTenantIdAndEmailIgnoreCase(tenantId, email)
                    .orElseThrow(() -> new IllegalStateException("insertIfAbsent completed but no row found for " + email));
        }

        // Re-checked on every login while the member has no role — a
        // concurrent loser of the insert race, or any other still-role-less
        // account, self-heals the next time its real JWT shows up carrying
        // admin/company-admin, instead of staying stuck until an already-
        // provisioned admin manually reassigns it.
        if (member.getRole() == null) {
            // Keycloak's realm_access.roles carries raw lowercase role names
            // (e.g. "admin", "company-admin" — see PlatformUserService.
            // COMPANY_ADMIN_ROLE); the ROLE_ADMIN/ROLE_COMPANY_ADMIN Spring
            // authorities used elsewhere are an uppercased transform of
            // these built specifically for hasRole()/hasAnyRole(), not the
            // raw claim.
            List<String> jwtRoles = TenantContext.getUserRoles().stream().map(String::toLowerCase).toList();
            if (jwtRoles.contains("admin") || jwtRoles.contains("company-admin")) {
                defaultRoleProvisioner.findSuperAdmin(tenantId).ifPresent(role -> {
                    member.setRole(role);
                    userMemberRepository.save(member);
                });
            }
        }
        return Optional.of(member);
    }
}
