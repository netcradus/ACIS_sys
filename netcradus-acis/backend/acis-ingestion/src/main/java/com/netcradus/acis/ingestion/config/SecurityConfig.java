package com.netcradus.acis.ingestion.config;

import com.netcradus.acis.common.apikey.ApiKeyRepository;
import com.netcradus.acis.common.tenant.TenantContextFilter;
import com.netcradus.acis.ingestion.security.ApiKeyAuthFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

import static org.springframework.security.config.Customizer.withDefaults;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final ApiKeyRepository apiKeyRepository;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        ApiKeyAuthFilter apiKeyAuthFilter = new ApiKeyAuthFilter(apiKeyRepository);

        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/**").permitAll()
                // Authenticated by ApiKeyAuthFilter below instead of a JWT — external
                // systems (e.g. a customer's own server) can't hold a Keycloak token.
                .requestMatchers("/api/ingest/external/**").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth -> oauth.jwt(withDefaults()))
            .addFilterAfter(apiKeyAuthFilter, BearerTokenAuthenticationFilter.class)
            .addFilterAfter(new TenantContextFilter(), ApiKeyAuthFilter.class);

        return http.build();
    }
}
