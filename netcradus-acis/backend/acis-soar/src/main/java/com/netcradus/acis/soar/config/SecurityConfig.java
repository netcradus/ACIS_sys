package com.netcradus.acis.soar.config;

import com.netcradus.acis.common.tenant.TenantContextFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/**").permitAll()
                // H-01/M-01 fix: /settings/** covers billing, API keys, org
                // ownership transfer, org deletion, user/role management and
                // datasource config — tenant-administration actions that must
                // never be reachable by viewer/analyst/engineer roles. Every
                // OTHER controller in this module (playbooks, compliance,
                // reports, red-team) is deliberately left at "authenticated()"
                // below, since those are legitimate day-to-day SOC-analyst
                // tools, not admin-only surfaces.
                .requestMatchers("/api/soar/settings/**").hasAnyRole("ADMIN", "COMPANY_ADMIN", "PLATFORM_ADMIN")
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())))
            .addFilterAfter(new TenantContextFilter(), BearerTokenAuthenticationFilter.class);

        return http.build();
    }

    // Mirrors acis-platform-admin's SecurityConfig: Keycloak's realm_access.roles
    // claim isn't mapped to Spring authorities by the default JWT converter
    // (it only reads a "scope"/"scp" claim), so hasRole()/hasAnyRole() above
    // would silently match nothing — and deny everyone — without this.
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
