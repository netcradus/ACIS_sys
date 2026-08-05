package com.netcradus.acis.threat.config;

import com.netcradus.acis.common.rbac.PermissionResolver;
import com.netcradus.acis.common.rbac.RbacEnforcementFilter;
import com.netcradus.acis.common.tenant.TenantContextFilter;
import lombok.RequiredArgsConstructor;
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

    private final PermissionResolver permissionResolver;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        LinkedHashMap<String, String> pathToModule = new LinkedHashMap<>();
        pathToModule.put("/api/threat-intel", "Assets & Threat Intel");
        RbacEnforcementFilter rbacFilter = new RbacEnforcementFilter(permissionResolver, pathToModule);

        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/**").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth -> oauth.jwt(withDefaults()))
            .addFilterAfter(new TenantContextFilter(), BearerTokenAuthenticationFilter.class)
            .addFilterAfter(rbacFilter, TenantContextFilter.class);

        return http.build();
    }
}
