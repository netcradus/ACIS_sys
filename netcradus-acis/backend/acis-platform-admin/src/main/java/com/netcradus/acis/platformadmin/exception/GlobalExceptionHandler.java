package com.netcradus.acis.platformadmin.exception;

import com.netcradus.acis.common.dto.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/**
 * Every service method in this module throws plain ResponseStatusException(status, "reason")
 * for validation failures (e.g. "username is required", "Unknown tenant: X") — these reasons
 * are real, intentional, client-safe messages, not accidental exception leakage. Left to
 * Spring Boot's default /error handling, they are silently discarded: server.error.include-message
 * defaults to "never", so the response body carries only {timestamp,status,error,path} with no
 * message at all. This advice re-wraps them into the project's own ApiResponse envelope so the
 * reason actually reaches the caller — the same way every other custom exception in this module
 * already does via its controller-local @ExceptionHandler.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiResponse<Void>> handleResponseStatusException(ResponseStatusException ex) {
        String message = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode())
                .body(ApiResponse.failure("ERR_" + ex.getStatusCode().value(), message));
    }
}
