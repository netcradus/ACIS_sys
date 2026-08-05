package com.netcradus.acis.common.tenant;

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
    private static final ThreadLocal<Boolean> API_KEY_LOOKUP = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> SYSTEM_POLLER = new ThreadLocal<>();

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

    /** Tenant ID as a UUID, for services whose tenant_id columns are typed UUID. */
    public static UUID getTenantIdAsUuid() {
        String id = TENANT_ID.get();
        return id != null ? UUID.fromString(id) : null;
    }

    public static void setUserId(UUID userId) { USER_ID.set(userId); }
    public static UUID getUserId() { return USER_ID.get(); }

    public static void setUserEmail(String email) { USER_EMAIL.set(email); }
    public static String getUserEmail() { return USER_EMAIL.get(); }

    public static void clear() {
        TENANT_ID.remove();
        USER_ID.remove();
        USER_EMAIL.remove();
        API_KEY_LOOKUP.remove();
        SYSTEM_POLLER.remove();
    }
}
