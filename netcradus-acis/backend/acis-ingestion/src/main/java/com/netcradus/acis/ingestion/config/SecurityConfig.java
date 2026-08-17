package com.netcradus.acis.ingestion.config;

import com.netcradus.acis.common.apikey.ApiKeyRepository;
import com.netcradus.acis.common.rbac.PermissionResolver;
import com.netcradus.acis.common.rbac.RbacEnforcementFilter;
import com.netcradus.acis.common.tenant.TenantContextFilter;
import com.netcradus.acis.ingestion.security.ApiKeyAuthFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

import java.util.LinkedHashMap;

import static org.springframework.security.config.Customizer.withDefaults;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final ApiKeyRepository apiKeyRepository;
    private final PermissionResolver permissionResolver;

    @Value("${acis.internal-service-key:}")
    private String internalServiceKey;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        ApiKeyAuthFilter apiKeyAuthFilter = new ApiKeyAuthFilter(apiKeyRepository);

        // Added during the production-readiness audit: this service was the
        // only one with no RbacEnforcementFilter at all, so any authenticated
        // user of ANY role/tenant-permission level - not just those with a
        // "Alerts & Correlation" WRITE grant - could inject arbitrary log
        // events via /api/ingest/syslog|json. Deliberately does NOT map
        // /api/ingest/external/** or /services/collector/** - those are
        // authenticated by ApiKeyAuthFilter/a Splunk token, not a JWT with a
        // real user/RBAC context, so RBAC must stay skipped for them (an
        // unmapped path passes through RbacEnforcementFilter unchecked, same
        // as every other service's intentionally-excluded paths).
        LinkedHashMap<String, String> pathToModule = new LinkedHashMap<>();
        pathToModule.put("/api/ingest/syslog", "Alerts & Correlation");
        pathToModule.put("/api/ingest/json", "Alerts & Correlation");
        RbacEnforcementFilter rbacFilter = new RbacEnforcementFilter(permissionResolver, pathToModule, internalServiceKey);

        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/**").permitAll()
                // Authenticated by ApiKeyAuthFilter below instead of a JWT — external
                // systems (e.g. a customer's own server) can't hold a Keycloak token.
                .requestMatchers("/api/ingest/external/**").permitAll()
                // Real Splunk HEC wire path (see SplunkHecController) — forwarders
                // authenticate via "Authorization: Splunk <token>", not a JWT.
                .requestMatchers("/services/collector/**").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth -> oauth.jwt(withDefaults()))
            .addFilterAfter(apiKeyAuthFilter, BearerTokenAuthenticationFilter.class)
            .addFilterAfter(new TenantContextFilter(), ApiKeyAuthFilter.class)
            .addFilterAfter(rbacFilter, TenantContextFilter.class);

        return http.build();
    }
}
