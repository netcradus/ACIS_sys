package com.netcradus.acis.common.tenant;

import java.util.UUID;

/**
 * Thread-local holder for the current tenant context.
 * Populated from JWT claims by TenantContextFilter in each service.
 * All JPA queries must use tenantId from this context for data isolation.
 */
public class TenantContext {
    private static final ThreadLocal<String> TENANT_ID = new ThreadLocal<>();
    private static final ThreadLocal<UUID>   USER_ID   = new ThreadLocal<>();

    public static void setTenantId(String tenantId) { TENANT_ID.set(tenantId); }
    public static String getTenantId() { return TENANT_ID.get(); }

    public static void setUserId(UUID userId) { USER_ID.set(userId); }
    public static UUID getUserId() { return USER_ID.get(); }

    public static void clear() {
        TENANT_ID.remove();
        USER_ID.remove();
    }
}
