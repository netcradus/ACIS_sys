package com.netcradus.acis.log.config;

import com.netcradus.acis.common.rbac.PermissionResolver;
import com.netcradus.acis.common.rbac.RbacEnforcementFilter;
import com.netcradus.acis.common.tenant.TenantContextFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

import java.util.LinkedHashMap;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final PermissionResolver permissionResolver;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        LinkedHashMap<String, String> pathToModule = new LinkedHashMap<>();
        pathToModule.put("/api/logs", "Alerts & Correlation");
        RbacEnforcementFilter rbacFilter = new RbacEnforcementFilter(permissionResolver, pathToModule);

        http
            .csrf(AbstractHttpConfigurer::disable)
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/**", "/ws/logs/**").permitAll()
                .requestMatchers("/api/logs/**").hasAuthority("SCOPE_openid")
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> {}))
            .addFilterAfter(new TenantContextFilter(), BearerTokenAuthenticationFilter.class)
            .addFilterAfter(rbacFilter, TenantContextFilter.class);

        return http.build();
    }
}

