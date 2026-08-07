package com.netcradus.acis.common.rbac;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The one place the standard 4-role starter set is defined — shared by
 * SettingsController (Settings > Roles & Permissions, lazily seeds these the
 * first time a tenant opens that tab) and PermissionResolver (which needs
 * "does a Super Admin role exist yet" during auto-provisioning of a
 * first-time real login — see PermissionResolver for why that matters).
 * Idempotent: a tenant that already has roles gets those back untouched.
 */
@Component
@RequiredArgsConstructor
public class DefaultRoleProvisioner {

    public static final String SUPER_ADMIN = "Super Admin";

    /**
     * The 5 modules RbacEnforcementFilter's path→module tables across every
     * service actually resolve requests into. "Dashboard" used to be a 6th
     * entry here despite having no backend endpoints of its own — the
     * Dashboard page's real data calls (/api/alerts/dashboard/summary,
     * /api/alerts) were always gated under "Alerts & Correlation" instead.
     * That let an admin grant someone "Dashboard" alone (a natural minimal
     * grant) while the page's own data calls kept 403ing — confirmed live:
     * a role with only Dashboard=READ passed the page-level gate but every
     * fetch inside it failed. The Dashboard nav item/route is now gated on
     * Alerts & Correlation directly (see Sidebar.tsx/router.tsx), the module
     * it actually and exclusively depends on, instead of a second module
     * that only pretended to be independent.
     */
    public static final String[] MODULES = {
            "Alerts & Correlation", "Assets & Threat Intel",
            "SOAR Playbooks", "Reports & Compliance", "Settings"
    };

    private final ConsoleRoleRepository consoleRoleRepository;

    public List<ConsoleRole> ensureDefaultRoles(UUID tenantId) {
        List<ConsoleRole> existing = consoleRoleRepository.findByTenantId(tenantId);
        if (!existing.isEmpty()) {
            return existing;
        }
        List<ConsoleRole> created = new ArrayList<>();
        created.add(buildRole(tenantId, SUPER_ADMIN, levels("ADMIN", "ADMIN", "WRITE", "ADMIN", "ADMIN")));
        created.add(buildRole(tenantId, "SOC Analyst", levels("WRITE", "READ", "NONE", "READ", "NONE")));
        created.add(buildRole(tenantId, "Incident Responder", levels("WRITE", "WRITE", "WRITE", "READ", "NONE")));
        created.add(buildRole(tenantId, "Read-Only Auditor", levels("READ", "READ", "READ", "READ", "READ")));
        List<ConsoleRole> saved = new ArrayList<>();
        created.forEach(r -> saved.add(consoleRoleRepository.save(r)));
        return saved;
    }

    /** Used by PermissionResolver's auto-provisioning of a first-time Keycloak ADMIN/COMPANY_ADMIN login. */
    public Optional<ConsoleRole> findSuperAdmin(UUID tenantId) {
        return ensureDefaultRoles(tenantId).stream()
                .filter(r -> SUPER_ADMIN.equals(r.getName()))
                .findFirst();
    }

    private Map<String, String> levels(String... values) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i < MODULES.length; i++) {
            map.put(MODULES[i], values[i]);
        }
        return map;
    }

    private ConsoleRole buildRole(UUID tenantId, String name, Map<String, String> moduleLevels) {
        ConsoleRole role = new ConsoleRole();
        role.setTenantId(tenantId);
        role.setName(name);
        role.setUserCount(0);
        List<RolePermission> perms = new ArrayList<>();
        moduleLevels.forEach((module, level) -> {
            RolePermission perm = new RolePermission();
            perm.setTenantId(tenantId);
            perm.setRole(role);
            perm.setModuleName(module);
            perm.setPermissionLevel(level);
            perms.add(perm);
        });
        role.setPermissions(perms);
        return role;
    }
}
