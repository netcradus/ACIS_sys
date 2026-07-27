package com.netcradus.acis.platformadmin.dto;

import java.util.List;

/**
 * Security overview for a user — aggregates account status, brute-force
 * state, MFA status, required actions, and active session count.
 */
public record UserSecurityInfo(
        String userId,
        String username,
        String accountStatus,
        boolean enabled,
        boolean bruteForceLocked,
        int failedLoginAttempts,
        String lastFailureTimestamp,
        boolean mfaEnabled,
        boolean mfaRequired,
        int otpDeviceCount,
        boolean passwordChangeRequired,
        List<String> requiredActions,
        int activeSessionCount,
        Long createdTimestamp
) {
}
