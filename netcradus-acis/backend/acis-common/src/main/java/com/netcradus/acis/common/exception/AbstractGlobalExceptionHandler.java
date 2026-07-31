package com.netcradus.acis.common.exception;

import com.netcradus.acis.common.dto.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.server.ResponseStatusException;

/**
 * Shared exception-to-HTTP-status mapping for every acis-* service. Spring's
 * component scan defaults to each service's own base package, so this
 * abstract class is never itself an active @RestControllerAdvice — add a
 * concrete no-op subclass annotated @RestControllerAdvice inside each
 * service's own package (see acis-alerts/acis-correlation for the pattern).
 *
 * Only genuine not-found cases become 404: NotFoundException (thrown
 * explicitly at a lookup site) and ResponseStatusException (an
 * already-decided status, e.g. from request validation). Every OTHER
 * exception is a real server-side failure and stays a 500 — nothing here
 * reclassifies unexpected errors as "not found" to hide them. The fix is
 * that an unexpected exception no longer leaks Spring Boot's default
 * {timestamp,status,error,path} whitelabel body (which bypasses this app's
 * own ApiResponse envelope entirely) — it becomes a clean, generic
 * ApiResponse-shaped 500, while the full exception with stack trace is
 * still logged server-side for debugging. Nothing is masked; only what
 * reaches the client is cleaned up.
 */
@Slf4j
public abstract class AbstractGlobalExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(NotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.failure("ERR_404", ex.getMessage()));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiResponse<Void>> handleResponseStatusException(ResponseStatusException ex) {
        String message = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode())
                .body(ApiResponse.failure("ERR_" + ex.getStatusCode().value(), message));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.failure("ERR_500",
                        "An unexpected error occurred. Please try again or contact support if the problem persists."));
    }
}
