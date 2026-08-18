package com.netcradus.acis.asset.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;

/**
 * Test-only security wiring for JwtAuthenticationTest — mirrors the real
 * {@code .oauth2ResourceServer(oauth -> oauth.jwt(withDefaults()))} pattern
 * every ACIS service's SecurityConfig uses (see e.g.
 * acis-asset-service's own SecurityConfig), substituting a locally
 * generated RSA key pair for Keycloak's live JWKS endpoint since tests
 * can't reach a running IdP. The signature/expiry validation itself is
 * Spring Security's real, unmocked NimbusJwtDecoder logic.
 *
 * Top-level (not nested in the test class) because @WebMvcTest's component
 * scan for the explicitly-named controller did not reliably pick up a
 * statically-nested controller/config pair declared inside the test class
 * itself in this project's Spring Boot 3.3.11 setup — confirmed by a 404
 * (no handler mapped) on an otherwise-successfully-authenticated request
 * when both were nested.
 */
@Configuration
@EnableWebSecurity
public class JwtTestSecurityConfig {

    public static final KeyPair KEY_PAIR = generateKeyPair();

    private static KeyPair generateKeyPair() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            return generator.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException("Failed to generate test RSA key pair", e);
        }
    }

    @Bean
    public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.decoder(jwtDecoder())));
        return http.build();
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        return NimbusJwtDecoder.withPublicKey((RSAPublicKey) KEY_PAIR.getPublic()).build();
    }
}
