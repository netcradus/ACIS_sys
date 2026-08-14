package com.netcradus.acis.alerts.config;

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
     * All JPA/Hibernate connections go through this wrapper so RLS policies can
     * see the caller's tenant. Built directly from DataSourceProperties (not by
     * injecting the autoconfigured DataSource bean) — declaring a @Bean of type
     * DataSource here would satisfy DataSourceAutoConfiguration's
     * @ConditionalOnMissingBean(DataSource.class) and suppress it entirely,
     * leaving nothing for this method to wrap (a self-referencing circular bean).
     */
    @Bean
    @Primary
    public DataSource tenantAwareDataSource(DataSourceProperties properties) {
        DataSource real = properties.initializeDataSourceBuilder().build();
        return new TenantAwareDataSource(real);
    }

    /** Runs after AlertDataSeeder (Order 0) so seed inserts happen before RLS is enforced. */
    @Bean
    @Order(1000)
    public CommandLineRunner enableRowLevelSecurity(JdbcTemplate jdbcTemplate) {
        return args -> RlsBootstrapper.apply(jdbcTemplate, "incidents");
    }

    /**
     * alerts needs the same non-standard policy as acis-soar's vendor poller
     * tables: GET /api/alerts/labeled (see AlertController) must read
     * analyst-confirmed labels across every tenant to train the one shared
     * classifier, with no per-request tenant context of its own — gated by
     * app.system_poller, the same GUC only that kind of internal system read
     * ever sets (see TenantContext.setSystemPollerInProgress and
     * TenantAwareDataSource). Every write still goes through WITH CHECK
     * unmodified, since normal request-scoped writes always carry the real
     * tenant id.
     */
    @Bean
    @Order(1001)
    public CommandLineRunner enableAlertsRowLevelSecurity(JdbcTemplate jdbcTemplate) {
        return args -> {
            jdbcTemplate.execute("ALTER TABLE alerts ENABLE ROW LEVEL SECURITY");
            jdbcTemplate.execute("ALTER TABLE alerts FORCE ROW LEVEL SECURITY");
            jdbcTemplate.execute("DROP POLICY IF EXISTS tenant_isolation ON alerts");
            jdbcTemplate.execute("CREATE POLICY tenant_isolation ON alerts" +
                    " USING (tenant_id::text = current_setting('app.current_tenant_id', true)" +
                    "        OR current_setting('app.system_poller', true) = 'true')" +
                    " WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true))");
        };
    }
}
