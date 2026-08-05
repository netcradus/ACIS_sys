package com.netcradus.acis.log.config;

import com.netcradus.acis.common.tenant.TenantAwareDataSource;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;

/**
 * Wraps the real DataSource so RbacEnforcementFilter's queries against the
 * shared RBAC tables (user_members/console_roles/role_permissions) carry the
 * current tenant as a Postgres session GUC — see TenantAwareDataSource. Those
 * tables' RLS policies are owned and created once by acis-soar's RlsConfig
 * (the standard bootstrap, no special bypass needed here since every query
 * this service makes is already scoped to the caller's own tenant).
 */
@Configuration
public class TenantAwareDataSourceConfig {

    @Bean
    @Primary
    public DataSource tenantAwareDataSource(DataSourceProperties properties) {
        DataSource real = properties.initializeDataSourceBuilder().build();
        return new TenantAwareDataSource(real);
    }
}
