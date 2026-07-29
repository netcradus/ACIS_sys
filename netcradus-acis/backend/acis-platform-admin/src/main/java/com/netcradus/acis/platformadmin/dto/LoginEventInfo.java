package com.netcradus.acis.platformadmin.dto;

/**
 * A single realm login/logout event, sourced from Keycloak's own event log
 * (requires eventsEnabled=true on the realm — see UserSecurityService.getLoginEvents).
 */
public record LoginEventInfo(
        String type,
        Long time,
        String ipAddress,
        String error,
        String clientId
) {
}
