package com.netcradus.acis.soar.config;

import org.keycloak.OAuth2Constants;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.admin.client.KeycloakBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Admin REST client for Keycloak, authenticated as the same acis-backend
 * confidential client's service account acis-platform-admin already uses
 * (see that service's KeycloakAdminConfig — identical pattern, same
 * underlying Keycloak client/secret, just a second service using it). This
 * is what actually creates a real login for an invited member once they
 * accept — see InvitationService.
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
