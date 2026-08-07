package com.netcradus.acis.platformadmin.config;

import com.netcradus.acis.common.tenant.TenantContextFilter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Unlike every other acis-* service (which allows any authenticated JWT),
 * this service requires the "platform-admin" realm role — it is the one
 * place in the system where a user can act across every tenant, so it gets
 * its own, stricter authorization rule rather than reusing the shared
 * "any authenticated user" pattern.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@Slf4j
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/**").permitAll()
                // The one deliberately public, unauthenticated endpoint in this
                // service — see TenantSignupController's own class javadoc for
                // why (self-service tenant signup can't require a pre-existing
                // token) and its rate-limiting caveats.
                .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/platform/signup").permitAll()
                // Real public tenant-onboarding activation flow (see
                // TenantActivationController) — GET to preview the link, POST to
                // accept it. No JWT exists until acceptance succeeds and the new
                // tenant admin logs in for the first time.
                .requestMatchers("/api/platform/activate/**").permitAll()
                .anyRequest().hasRole("PLATFORM_ADMIN")
            )
            .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())))
            .exceptionHandling(handling -> handling
                .accessDeniedHandler(accessDeniedHandler())
                .authenticationEntryPoint(authenticationEntryPoint())
            )
            .addFilterAfter(new TenantContextFilter(), BearerTokenAuthenticationFilter.class);

        return http.build();
    }

    /**
     * Rejected callers are logged (WARN), never audited via PlatformAuditService:
     * that table's adminUserId/adminUsername columns are non-null and represent
     * a legitimate admin actor, and an unauthenticated caller may have no
     * identity to populate them with. A log line is the honest artifact here.
     */
    @Bean
    public AccessDeniedHandler accessDeniedHandler() {
        return (request, response, ex) -> {
            Authentication auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
            log.warn("Access denied: method={} uri={} subject={} roles={}",
                    request.getMethod(), request.getRequestURI(),
                    describeSubject(auth), describeRoles(auth));
            response.sendError(403, "Access Denied");
        };
    }

    @Bean
    public AuthenticationEntryPoint authenticationEntryPoint() {
        return (request, response, ex) -> {
            log.warn("Unauthenticated request rejected: method={} uri={} reason={}",
                    request.getMethod(), request.getRequestURI(), ex.getMessage());
            response.sendError(401, "Unauthorized");
        };
    }

    private static String describeSubject(Authentication auth) {
        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            Jwt jwt = jwtAuth.getToken();
            String email = jwt.getClaimAsString("email");
            return email != null ? email : jwt.getSubject();
        }
        return auth != null ? auth.getName() : "anonymous";
    }

    private static String describeRoles(Authentication auth) {
        if (auth == null) {
            return "[]";
        }
        return auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.joining(","));
    }

    private JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter defaultConverter = new JwtGrantedAuthoritiesConverter();
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            Collection<GrantedAuthority> authorities = defaultConverter.convert(jwt).stream().collect(Collectors.toList());
            authorities.addAll(realmRoleAuthorities(jwt));
            return authorities;
        });
        return converter;
    }

    @SuppressWarnings("unchecked")
    private Collection<GrantedAuthority> realmRoleAuthorities(Jwt jwt) {
        Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
        if (realmAccess == null) {
            return List.of();
        }
        Object roles = realmAccess.get("roles");
        if (!(roles instanceof List<?> roleList)) {
            return List.of();
        }
        return roleList.stream()
                .map(role -> "ROLE_" + role.toString().toUpperCase().replace('-', '_'))
                .map(SimpleGrantedAuthority::new)
                .collect(Collectors.toUnmodifiableList());
    }
}
