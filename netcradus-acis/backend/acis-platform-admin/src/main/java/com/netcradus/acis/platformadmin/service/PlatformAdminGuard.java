package com.netcradus.acis.platformadmin.service;

import com.netcradus.acis.platformadmin.exception.LastPlatformAdminException;
import lombok.RequiredArgsConstructor;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.resource.RealmResource;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Cross-cutting safety net shared by PlatformUserService and
 * UserSecurityService: prevents a delete/deactivate/lock/role-removal
 * operation from leaving the realm with zero platform-admin users.
 */
@Component
@RequiredArgsConstructor
public class PlatformAdminGuard {

    public static final String PLATFORM_ADMIN_ROLE = "platform-admin";

    private final Keycloak keycloak;

    @Value("${acis.keycloak.realm}")
    private String realmName;

    private RealmResource realm() {
        return keycloak.realm(realmName);
    }

    /**
     * Fetches at most 2 platform-admin members — enough to distinguish
     * "exactly one exists" from "two or more exist" without an unbounded scan.
     */
    public void assertNotLastPlatformAdmin(String userId, String action) {
        List<UserRepresentation> admins = realm().roles().get(PLATFORM_ADMIN_ROLE).getUserMembers(0, 2);
        boolean targetIsAdmin = admins.stream().anyMatch(u -> u.getId().equals(userId));
        if (targetIsAdmin && admins.size() <= 1) {
            throw new LastPlatformAdminException(action);
        }
    }
}
