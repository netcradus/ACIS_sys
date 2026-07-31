package com.netcradus.acis.common.exception;

/**
 * Throw this for a genuine "the requested resource does not exist" case
 * (e.g. an id lookup that returned Optional.empty()) — distinct from any
 * other RuntimeException, so AbstractGlobalExceptionHandler can map only
 * real not-found cases to HTTP 404 without accidentally reclassifying
 * unrelated failures.
 */
public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) {
        super(message);
    }
}
