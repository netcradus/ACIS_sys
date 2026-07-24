package com.netcradus.acis.platformadmin.dto;

import java.util.List;

public record PlatformUserSummary(
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
        Long createdTimestamp
) {
}
