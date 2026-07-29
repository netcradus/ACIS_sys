package com.netcradus.acis.platformadmin.exception;

/**
 * Thrown when an operation (delete, deactivate, lock, or role-removal) would
 * leave the realm with zero users holding the "platform-admin" role. Keycloak
 * has no native "last admin" safeguard, and losing this role platform-wide
 * requires falling back to direct Keycloak console access to recover — this
 * guard exists specifically to prevent that avoidable, irreversible-in-practice
 * lockout.
 */
public class LastPlatformAdminException extends RuntimeException {

    public LastPlatformAdminException(String action) {
        super("Cannot " + action + " the last remaining Platform Admin account. "
                + "Promote another user to Platform Admin first.");
    }
}
