package com.netcradus.acis.asset.security;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.web.servlet.MockMvc;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.util.Date;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Real JWT validation coverage using Spring Security's actual OAuth2
 * resource-server machinery — {@code NimbusJwtDecoder} plus its default
 * validator chain (signature verification + {@code JwtTimestampValidator}
 * for exp/nbf) — wired the same way every ACIS service's SecurityConfig
 * wires it: {@code .oauth2ResourceServer(oauth -> oauth.jwt(...))} (see
 * JwtTestSecurityConfig).
 *
 * The only substitution from production is the key source: a test can't
 * reach a live Keycloak JWKS endpoint
 * ({@code ${KEYCLOAK_URL}/realms/acis/protocol/openid-connect/certs}), so
 * the decoder is built from a locally generated RSA key pair instead. The
 * validation logic being exercised — signature check, expiry check,
 * rejecting malformed input — is Spring's real, unmocked code, not a fake.
 *
 * TenantContextFilter/RbacEnforcementFilter are intentionally NOT part of
 * this filter chain — they're covered by their own real tests
 * (RbacEnforcementFilterTest, TenantIsolationRlsIntegrationTest); this test
 * isolates authentication itself.
 *
 * {@code @ContextConfiguration(classes = ...)} is given explicitly (instead
 * of relying on {@code @WebMvcTest}'s automatic nearest-@SpringBootConfiguration
 * detection) specifically to bypass AcisAssetApplication as the context
 * root: that class carries an explicit {@code @EnableJpaRepositories}
 * (not merely JPA auto-configuration, which @WebMvcTest does exclude), so
 * letting it be auto-detected drags in AssetRepository/AssetDataSeeder and
 * fails context startup for want of a real DataSource — nothing to do with
 * the JWT behavior this test actually exercises.
 */
@WebMvcTest(controllers = TestPingController.class)
@ContextConfiguration(classes = { TestPingController.class, JwtTestSecurityConfig.class })
class JwtAuthenticationTest {

    private static KeyPair untrustedKeyPair;

    @Autowired
    private MockMvc mockMvc;

    @BeforeAll
    static void generateUntrustedKey() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        untrustedKeyPair = gen.generateKeyPair();
    }

    private static String signedToken(KeyPair signingKey, Date expiry) throws JOSEException {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject("11111111-1111-4111-8111-111111111111")
                .claim("tenant_id", "tenant-a")
                .claim("email", "user@example.com")
                .issueTime(new Date(System.currentTimeMillis() - 60_000))
                .expirationTime(expiry)
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), claims);
        jwt.sign(new RSASSASigner((RSAPrivateKey) signingKey.getPrivate()));
        return jwt.serialize();
    }

    @Test
    void validTokenIsAccepted() throws Exception {
        String token = signedToken(JwtTestSecurityConfig.KEY_PAIR, new Date(System.currentTimeMillis() + 60_000));

        mockMvc.perform(get("/api/assets/ping").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void missingTokenIsRejected() throws Exception {
        mockMvc.perform(get("/api/assets/ping"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void expiredTokenIsRejected() throws Exception {
        String token = signedToken(JwtTestSecurityConfig.KEY_PAIR, new Date(System.currentTimeMillis() - 60_000));

        mockMvc.perform(get("/api/assets/ping").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void malformedTokenIsRejected() throws Exception {
        mockMvc.perform(get("/api/assets/ping").header("Authorization", "Bearer not-a-real-jwt"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void tokenSignedWithAnUntrustedKeyIsRejected() throws Exception {
        String token = signedToken(untrustedKeyPair, new Date(System.currentTimeMillis() + 60_000));

        mockMvc.perform(get("/api/assets/ping").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }
}
