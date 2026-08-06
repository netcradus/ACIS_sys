package com.netcradus.acis.soar.config;

import com.netcradus.acis.common.rbac.PermissionResolver;
import com.netcradus.acis.common.rbac.RbacEnforcementFilter;
import com.netcradus.acis.common.tenant.TenantContextFilter;
import lombok.RequiredArgsConstructor;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final PermissionResolver permissionResolver;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        // Longest-prefix-first: /api/soar/settings and /api/soar/reports must be
        // matched before the generic /api/soar (PlaybookController) catch-all.
        LinkedHashMap<String, String> pathToModule = new LinkedHashMap<>();
        pathToModule.put("/api/soar/settings", "Settings");
        pathToModule.put("/api/soar/reports", "Reports & Compliance");
        pathToModule.put("/api/red-team", "SOAR Playbooks");
        pathToModule.put("/api/compliance", "Reports & Compliance");
        pathToModule.put("/api/soar", "SOAR Playbooks");
        RbacEnforcementFilter rbacFilter = new RbacEnforcementFilter(permissionResolver, pathToModule);

        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/**").permitAll()
                // Real public accept-invite flow (InvitationController) — the
                // caller has no JWT at all until AFTER they accept, since no
                // Keycloak account exists before then (see InvitationService).
                // acis-gateway has a matching permitAll for this same prefix;
                // both are required, since the gateway is the first thing a
                // request reaches. Outside the /api/soar/settings/reports/
                // red-team/compliance prefixes RbacEnforcementFilter maps
                // below, so it needs no explicit exemption there either.
                .requestMatchers("/api/invitations/**").permitAll()
                // Real heartbeat/install-script surface (AgentController) — an
                // unattended script on a brand-new machine has no JWT either,
                // authenticated instead by the per-tenant enrollment token
                // inside the handler itself (see AgentEnrollmentService).
                .requestMatchers("/api/agent/**").permitAll()
                // Every authenticated tenant user — not just admins — needs to
                // read their own resolved permission map for frontend gating
                // (see PermissionResolver.resolveAll / SettingsController.
                // getMyPermissions), even though it lives under the otherwise
                // admin-only /settings/** prefix. Must be matched before that
                // blanket rule below (Spring evaluates authorizeHttpRequests
                // matchers in declaration order, first match wins).
                .requestMatchers("/api/soar/settings/my-permissions").authenticated()
                // Every authenticated tenant user must be able to view/edit their
                // OWN profile (name, phone, notification prefs, ...) — that's not
                // an admin-only capability just because it lives under /settings/**.
                // Same reasoning and same placement-before-the-blanket-rule
                // requirement as my-permissions above (see ProfileController).
                .requestMatchers("/api/soar/settings/profile").authenticated()
                // H-01/M-01 fix: /settings/** covers billing, API keys, org
                // ownership transfer, org deletion, user/role management and
                // datasource config — tenant-administration actions that must
                // never be reachable by viewer/analyst/engineer roles. Every
                // OTHER controller in this module (playbooks, compliance,
                // reports, red-team) is deliberately left at "authenticated()"
                // below, since those are legitimate day-to-day SOC-analyst
                // tools, not admin-only surfaces. RbacEnforcementFilter (below)
                // adds a second, finer-grained layer on top of both: even an
                // ADMIN/COMPANY_ADMIN only gets in here if their assigned
                // Console Role also grants the "Settings" module.
                .requestMatchers("/api/soar/settings/**").hasAnyRole("ADMIN", "COMPANY_ADMIN", "PLATFORM_ADMIN")
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())))
            .addFilterAfter(new TenantContextFilter(), BearerTokenAuthenticationFilter.class)
            .addFilterAfter(rbacFilter, TenantContextFilter.class);

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
