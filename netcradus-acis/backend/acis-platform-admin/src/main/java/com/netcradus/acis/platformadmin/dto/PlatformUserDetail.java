package com.netcradus.acis.platformadmin.dto;

import java.util.List;

public record PlatformUserDetail(
        String id,
        String username,
        String email,
        String firstName,
        String lastName,
        boolean enabled,
        String tenantId,
        String tenantName,
        List<String> roles,
        boolean totp,
        List<String> requiredActions,
        Long createdTimestamp,
        boolean locked,
        int failedLoginAttempts
) {
}
