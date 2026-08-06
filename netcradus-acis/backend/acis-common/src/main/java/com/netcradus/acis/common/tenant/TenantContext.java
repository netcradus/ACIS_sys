package com.netcradus.acis.common.tenant;

import java.util.List;
import java.util.UUID;

/**
 * Thread-local holder for the current tenant context.
 * Populated from the validated JWT's tenant_id/sub/email claims by
 * TenantContextFilter in each service. All JPA queries must use tenantId
 * from this context (never a client-supplied header or request body value)
 * for data isolation.
 */
public class TenantContext {
    private static final ThreadLocal<String>  TENANT_ID   = new ThreadLocal<>();
    private static final ThreadLocal<UUID>    USER_ID     = new ThreadLocal<>();
    private static final ThreadLocal<String>  USER_EMAIL  = new ThreadLocal<>();
    private static final ThreadLocal<List<String>> USER_ROLES = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> API_KEY_LOOKUP = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> SYSTEM_POLLER = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> INVITATION_LOOKUP = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> AGENT_TOKEN_LOOKUP = new ThreadLocal<>();

    public static void setTenantId(String tenantId) { TENANT_ID.set(tenantId); }
    public static String getTenantId() { return TENANT_ID.get(); }

    /**
     * True only for the brief window a request is looking up which tenant an
     * API key belongs to (see acis-ingestion's ApiKeyAuthFilter) — the one
     * legitimate case in this codebase where a query must see rows across
     * every tenant, since the tenant isn't known until the lookup succeeds.
     * TenantAwareDataSource reads this to set a matching Postgres GUC that
     * api_keys' RLS policy checks; every other RLS-protected table is
     * unaffected since only that one policy looks at the GUC.
     */
    public static void setApiKeyLookupInProgress(boolean inProgress) { API_KEY_LOOKUP.set(inProgress); }
    public static boolean isApiKeyLookupInProgress() { return Boolean.TRUE.equals(API_KEY_LOOKUP.get()); }

    /**
     * True only while the scheduled vendor-integration poller (acis-soar's
     * IntegrationPollerService) is deciding which tenants have a
     * Palo Alto/Wazuh/SentinelOne integration configured — it runs on a
     * background thread with no request/JWT, so it must see rows across
     * every tenant for that one lookup, same rationale as the API key
     * bypass above. Every tenant-scoped write it subsequently performs
     * still sets the real tenant id first, so WITH CHECK is never relaxed.
     */
    public static void setSystemPollerInProgress(boolean inProgress) { SYSTEM_POLLER.set(inProgress); }
    public static boolean isSystemPollerInProgress() { return Boolean.TRUE.equals(SYSTEM_POLLER.get()); }

    /**
     * True only for the brief window the public accept-invite flow is
     * looking up which tenant/member an invite token belongs to (see
     * SettingsController's invitation endpoints) — the caller has no JWT at
     * all at this point (they're not a user yet), so there's no tenant to
     * scope the lookup by until the token itself resolves one. Same
     * bypass-then-immediately-scope pattern as the API key lookup above.
     */
    public static void setInvitationLookupInProgress(boolean inProgress) { INVITATION_LOOKUP.set(inProgress); }
    public static boolean isInvitationLookupInProgress() { return Boolean.TRUE.equals(INVITATION_LOOKUP.get()); }

    /**
     * True only for the brief window a heartbeat/install script's inbound
     * call is resolving its raw enrollment token -> tenant (see
     * AgentController) — same bypass-then-immediately-scope shape as the
     * invitation lookup above, since the caller (an unattended script on a
     * customer machine) has no JWT and no other way to identify its tenant.
     */
    public static void setAgentTokenLookupInProgress(boolean inProgress) { AGENT_TOKEN_LOOKUP.set(inProgress); }
    public static boolean isAgentTokenLookupInProgress() { return Boolean.TRUE.equals(AGENT_TOKEN_LOOKUP.get()); }

    /** Tenant ID as a UUID, for services whose tenant_id columns are typed UUID. */
    public static UUID getTenantIdAsUuid() {
        String id = TENANT_ID.get();
        return id != null ? UUID.fromString(id) : null;
    }

    public static void setUserId(UUID userId) { USER_ID.set(userId); }
    public static UUID getUserId() { return USER_ID.get(); }

    public static void setUserEmail(String email) { USER_EMAIL.set(email); }
    public static String getUserEmail() { return USER_EMAIL.get(); }

    /** The JWT's realm_access.roles — e.g. ["ADMIN"], ["COMPANY_ADMIN"] — used by RBAC's auto-provisioning to decide a sensible starting Console Role for a first-time login rather than guessing. */
    public static void setUserRoles(List<String> roles) { USER_ROLES.set(roles); }
    public static List<String> getUserRoles() { return USER_ROLES.get() != null ? USER_ROLES.get() : List.of(); }

    public static void clear() {
        TENANT_ID.remove();
        USER_ID.remove();
        USER_EMAIL.remove();
        USER_ROLES.remove();
        API_KEY_LOOKUP.remove();
        SYSTEM_POLLER.remove();
        INVITATION_LOOKUP.remove();
        AGENT_TOKEN_LOOKUP.remove();
    }
}
