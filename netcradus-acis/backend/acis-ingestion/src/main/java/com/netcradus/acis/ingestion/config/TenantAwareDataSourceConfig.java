package com.netcradus.acis.ingestion.config;

import com.netcradus.acis.common.tenant.TenantAwareDataSource;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;

/**
 * Wraps the real DataSource so ApiKeyAuthFilter's queries carry tenant/lookup
 * context as Postgres session GUCs — see TenantAwareDataSource and
 * TenantContext.setApiKeyLookupInProgress. Without this, api_keys' RLS
 * policy (FORCE'd, see acis-soar's RlsConfig) would see zero rows from any
 * connection this service opens, since api_keys is the only table
 * acis-ingestion queries and it previously had no datasource at all.
 *
 * Deliberately does NOT also run RlsBootstrapper here — api_keys' RLS policy
 * is owned and created once by acis-soar; this service only needs its
 * connections to carry the GUCs that policy already checks.
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
