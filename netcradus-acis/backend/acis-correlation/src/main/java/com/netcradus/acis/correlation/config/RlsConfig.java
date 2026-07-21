package com.netcradus.acis.correlation.config;

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

    /** Runs after CorrelationRuleDataSeeder (Order 0) so seed inserts happen before RLS is enforced. */
    @Bean
    @Order(1000)
    public CommandLineRunner enableRowLevelSecurity(JdbcTemplate jdbcTemplate) {
        return args -> RlsBootstrapper.apply(jdbcTemplate, "correlation_rules");
    }
}
