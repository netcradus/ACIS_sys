package com.netcradus.acis.platformadmin.config;

import org.keycloak.OAuth2Constants;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.KeycloakBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Admin REST client for Keycloak, authenticated as the existing acis-backend
 * confidential client's service account (already granted manage-users /
 * view-users in Phase 1a). This is the only way user management in this
 * service touches identity data — never a local-DB shortcut, per the
 * explicit requirement that the platform admin manages the same users that
 * actually authenticate into the system.
 */
@Configuration
public class KeycloakAdminConfig {

    @Bean
    public Keycloak keycloakAdminClient(
            @Value("${acis.keycloak.server-url}") String serverUrl,
            @Value("${acis.keycloak.realm}") String realm,
            @Value("${acis.keycloak.admin-client-id}") String clientId,
            @Value("${acis.keycloak.admin-client-secret}") String clientSecret) {
        return KeycloakBuilder.builder()
                .serverUrl(serverUrl)
                .realm(realm)
                .grantType(OAuth2Constants.CLIENT_CREDENTIALS)
                .clientId(clientId)
                .clientSecret(clientSecret)
                .build();
    }
}
