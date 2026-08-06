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
                // Real public accept-invite flow (acis-soar's InvitationController)
                // — GET to preview the invite, POST to accept it. No JWT exists
                // until acceptance succeeds and the invitee logs in for the first
                // time, so both methods must be reachable without one.
                .pathMatchers("/api/invitations/**").permitAll()
                // Real heartbeat/install-script surface (acis-soar's AgentController)
                // — an unattended script on a brand-new machine has no JWT either.
                .pathMatchers("/api/agent/**").permitAll()
                // External log ingestion, authenticated by a tenant-scoped API key
                // instead of a Keycloak JWT (see acis-ingestion's ApiKeyAuthFilter) —
                // same reasoning as signup above: the gateway must not reject these
                // for lacking a JWT before ApiKeyAuthFilter ever gets a chance to run.
                .pathMatchers(HttpMethod.POST, "/api/ingest/external/**").permitAll()
                // Real Splunk HTTP Event Collector wire path (see SplunkHecController)
                // — forwarders authenticate via "Authorization: Splunk <token>", which
                // Spring's bearer-token resolver ignores (it only recognizes "Bearer "),
                // so this would otherwise fall through to anyExchange().authenticated()
                // and be rejected before ever reaching ApiKeyAuthFilter.
                .pathMatchers(HttpMethod.POST, "/services/collector/**").permitAll()
                // Everything else requires a valid JWT
                .anyExchange().authenticated()
            )

            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> {}) // jwk-set-uri configured in application.yml
            )
            .build();
    }
}
