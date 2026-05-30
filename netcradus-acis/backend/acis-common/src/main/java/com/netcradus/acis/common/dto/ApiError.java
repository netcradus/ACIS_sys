package com.netcradus.acis.common.dto;

/**
 * Standard error payload embedded in ApiResponse on failure.
 */
public record ApiError(
    String code,
    String message
) {
    // Common error code constants
    public static final String ERR_NOT_FOUND          = "ERR_NOT_FOUND";
    public static final String ERR_UNAUTHORIZED       = "ERR_UNAUTHORIZED";
    public static final String ERR_FORBIDDEN          = "ERR_FORBIDDEN";
    public static final String ERR_VALIDATION         = "ERR_VALIDATION";
    public static final String ERR_INTERNAL           = "ERR_INTERNAL";
    public static final String ERR_RATE_LIMITED       = "ERR_RATE_LIMITED";
    public static final String ERR_SERVICE_UNAVAILABLE = "ERR_SERVICE_UNAVAILABLE";
}
