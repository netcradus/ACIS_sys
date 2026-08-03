package com.netcradus.acis.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.web.server.SecurityWebFilterChain;

@Configuration
@EnableWebFluxSecurity
public class SecurityConfig {

    @Bean
    public SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
        return http
            .csrf(ServerHttpSecurity.CsrfSpec::disable)
            .cors(cors -> {}) // CORS handled by CorsConfig bean
            .authorizeExchange(exchanges -> exchanges
                // Public endpoints
                .pathMatchers("/actuator/health", "/actuator/info", "/ws/logs/**", "/ws/alerts/**").permitAll()
                // Self-service tenant signup (see TenantSignupController) — the
                // gateway is the first thing a request reaches, so acis-platform-
                // admin's own permitAll for this same path is not sufficient on
                // its own; a JWT-requiring gateway would reject it before the
                // downstream service is ever called.
                .pathMatchers(HttpMethod.POST, "/api/platform/signup").permitAll()
                // Everything else requires a valid JWT
                .anyExchange().authenticated()
            )

            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> {}) // jwk-set-uri configured in application.yml
            )
            .build();
    }
}
