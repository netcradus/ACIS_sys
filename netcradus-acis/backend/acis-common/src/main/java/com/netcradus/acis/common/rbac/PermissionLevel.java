package com.netcradus.acis.common.rbac;

/** Ordered NONE < READ < WRITE < ADMIN — the real ranking RbacEnforcementFilter compares against. */
public enum PermissionLevel {
    NONE(0), READ(1), WRITE(2), ADMIN(3);

    private final int rank;

    PermissionLevel(int rank) {
        this.rank = rank;
    }

    public boolean atLeast(PermissionLevel required) {
        return this.rank >= required.rank;
    }

    public static PermissionLevel fromString(String value) {
        if (value == null) return NONE;
        try {
            return valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return NONE;
        }
    }
}
