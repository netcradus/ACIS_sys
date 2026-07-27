package com.netcradus.acis.platformadmin.dto;

/**
 * Simplified session representation for the Platform Admin UI.
 */
public record UserSessionInfo(
        String sessionId,
        Long startTimestamp,
        Long lastAccessTimestamp,
        String ipAddress,
        String clients,
        String userAgent
) {
}
