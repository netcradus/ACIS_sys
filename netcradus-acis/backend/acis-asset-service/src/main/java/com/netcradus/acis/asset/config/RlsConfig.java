package com.netcradus.acis.asset.config;

import com.netcradus.acis.common.tenant.RlsBootstrapper;
import com.netcradus.acis.common.tenant.TenantAwareDataSource;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

@Configuration
public class RlsConfig {

    /**
     * Built directly from DataSourceProperties, not by injecting the
     * autoconfigured DataSource bean — declaring a @Bean of type DataSource
     * here would satisfy DataSourceAutoConfiguration's
     * @ConditionalOnMissingBean(DataSource.class) and suppress it entirely,
     * leaving nothing for this method to wrap (a self-referencing circular bean).
     */
    @Bean
    @Primary
    public DataSource tenantAwareDataSource(DataSourceProperties properties) {
        DataSource real = properties.initializeDataSourceBuilder().build();
        return new TenantAwareDataSource(real);
    }

    /** Runs after AssetDataSeeder (Order 0) so seed inserts happen before RLS is enforced. */
    @Bean
    @Order(1000)
    public CommandLineRunner enableRowLevelSecurity(JdbcTemplate jdbcTemplate) {
        return args -> RlsBootstrapper.apply(jdbcTemplate, "identities");
    }

    /**
     * assets needs the same non-standard policy as acis-soar's vendor-poller
     * tables (paloalto_integrations etc.), for the same reason:
     * AssetDriftDetectionService runs on a background @Scheduled thread with
     * no tenant context of its own, and must first ask "which tenants have
     * assets?" across every tenant before it can sweep any of them — gated by
     * app.system_poller, a GUC only that sweep ever sets (see
     * TenantContext.setSystemPollerInProgress and TenantAwareDataSource).
     * Every write (marking an asset DEGRADED) still goes through WITH CHECK
     * unmodified, since the sweep sets the real tenant id before saving.
     */
    @Bean
    @Order(1001)
    public CommandLineRunner enableAssetsRowLevelSecurity(JdbcTemplate jdbcTemplate) {
        return args -> {
            jdbcTemplate.execute("ALTER TABLE assets ENABLE ROW LEVEL SECURITY");
            jdbcTemplate.execute("ALTER TABLE assets FORCE ROW LEVEL SECURITY");
            jdbcTemplate.execute("DROP POLICY IF EXISTS tenant_isolation ON assets");
            jdbcTemplate.execute("CREATE POLICY tenant_isolation ON assets" +
                    " USING (tenant_id::text = current_setting('app.current_tenant_id', true)" +
                    "        OR current_setting('app.system_poller', true) = 'true')" +
                    " WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true))");
        };
    }
}
