package com.netcradus.acis.platformadmin.exception;

import lombok.Getter;

/**
 * Thrown when assigning "company-admin" to a user whose tenant already has a
 * different Company Admin. Keycloak has no native per-attribute-value role
 * uniqueness constraint, so this is enforced in application code.
 */
@Getter
public class CompanyAdminConflictException extends RuntimeException {

    private final String existingHolderEmail;

    public CompanyAdminConflictException(String existingHolderEmail) {
        super("Tenant already has a Company Admin: " + existingHolderEmail + ".");
        this.existingHolderEmail = existingHolderEmail;
    }
}
