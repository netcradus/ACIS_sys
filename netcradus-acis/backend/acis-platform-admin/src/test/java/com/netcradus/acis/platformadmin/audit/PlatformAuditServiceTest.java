package com.netcradus.acis.platformadmin.audit;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers PlatformAuditService.resolveAdminUsername's fallback chain — the fix
 * for the Audit Log "Admin" column showing a raw Keycloak subject UUID instead
 * of a human-readable identity when preferred_username is absent from the JWT.
 */
class PlatformAuditServiceTest {

    private static Jwt jwtWithClaims(Map<String, Object> claims) {
        Jwt.Builder builder = Jwt.withTokenValue("test-token")
                .header("alg", "none")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .subject("3beb81e7-c5fc-4ab8-8c17-fc9340c35968");
        claims.forEach(builder::claim);
        return builder.build();
    }

    @Test
    void prefersPreferredUsernameWhenPresent() {
        Jwt jwt = jwtWithClaims(Map.of(
                "preferred_username", "platform-admin",
                "email", "platform-admin@netcradus.local"
        ));
        assertThat(PlatformAuditService.resolveAdminUsername(jwt)).isEqualTo("platform-admin");
    }

    @Test
    void fallsBackToEmailWhenPreferredUsernameAbsent() {
        Jwt jwt = jwtWithClaims(Map.of(
                "email", "platform-admin@netcradus.local"
        ));
        assertThat(PlatformAuditService.resolveAdminUsername(jwt)).isEqualTo("platform-admin@netcradus.local");
    }

    @Test
    void fallsBackToSubjectWhenNeitherClaimPresent() {
        Jwt jwt = jwtWithClaims(Map.of("scope", "email acis-tenant"));
        assertThat(PlatformAuditService.resolveAdminUsername(jwt)).isEqualTo("3beb81e7-c5fc-4ab8-8c17-fc9340c35968");
    }

    @Test
    void ignoresBlankPreferredUsernameAndFallsBackToEmail() {
        Jwt jwt = jwtWithClaims(Map.of(
                "preferred_username", "   ",
                "email", "platform-admin@netcradus.local"
        ));
        assertThat(PlatformAuditService.resolveAdminUsername(jwt)).isEqualTo("platform-admin@netcradus.local");
    }
}
