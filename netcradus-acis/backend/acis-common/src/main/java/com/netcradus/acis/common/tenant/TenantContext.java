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
    private static final ThreadLocal<String> TENANT_ID   = new ThreadLocal<>();
    private static final ThreadLocal<UUID>   USER_ID     = new ThreadLocal<>();
    private static final ThreadLocal<String> USER_EMAIL  = new ThreadLocal<>();

    public static void setTenantId(String tenantId) { TENANT_ID.set(tenantId); }
    public static String getTenantId() { return TENANT_ID.get(); }

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
    }
}
