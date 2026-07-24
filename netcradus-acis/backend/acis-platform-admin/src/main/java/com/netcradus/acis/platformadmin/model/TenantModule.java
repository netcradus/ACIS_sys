package com.netcradus.acis.platformadmin.model;

/**
 * Mirrors frontend/src/components/Sidebar.tsx's navItems (minus Dashboard
 * and Settings, which are never gated) — the set of modules a platform
 * admin can enable/disable per tenant.
 */
public enum TenantModule {
    LOG_EXPLORER,
    CORRELATION,
    ALERTS,
    ASSETS,
    THREAT_INTEL,
    SOAR,
    RED_TEAM,
    ENDPOINTS,
    COMPLIANCE,
    REPORTS,
    AI_ANALYST
}
