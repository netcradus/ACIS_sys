package com.netcradus.acis.soar.config;

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
import java.util.List;

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

    /**
     * Runs after SeedConfig (Order 0) so seed inserts happen before RLS is
     * enforced. playbook_executions and red_team_executions are
     * intentionally excluded — they have no tenant_id column (they're
     * child records of a tenant-owned parent) and remain enforced at the
     * application layer, which already scopes them via the parent lookup.
     * report_schedules WAS in that same "no tenant_id" bucket, but that was
     * a real cross-tenant bug (confirmed live: every tenant could see/edit/
     * delete every other tenant's scheduled reports) rather than a genuine
     * child-record case — it now has its own tenant_id column and RLS like
     * everything else in this list.
     *
     * api_keys is also excluded from this generic list — see
     * enableApiKeysRowLevelSecurity below for why it needs a non-standard
     * policy instead of RlsBootstrapper's normal one.
     */
    @Bean
    @Order(1000)
    public CommandLineRunner enableRowLevelSecurity(JdbcTemplate jdbcTemplate) {
        return args -> RlsBootstrapper.apply(jdbcTemplate,
                "playbooks",
                "red_team_simulations",
                "console_roles",
                "role_permissions",
                "audit_entries",
                "integrations",
                "cloudflare_integrations",
                "organizations",
                "license_details",
                "invoices",
                "user_members",
                "user_groups",
                "agent_endpoints",
                "agent_policies",
                "report_schedules",
                // Added during the production-readiness audit - these six
                // tables (WAF policies, malware-scan results, dependency/
                // secret findings, containment actions/approvals) all have a
                // real tenant_id column and were missed when each feature
                // shipped, leaving tenant isolation resting entirely on
                // every repository query remembering to filter by tenant.
                "waf_policies",
                "file_scan_results",
                "dependency_findings",
                "secret_findings",
                "containment_actions",
                "containment_approvals");
    }

    /**
     * api_keys needs a policy RlsBootstrapper's generic one can't express:
     * every other tenant-owned table is only ever queried once the caller's
     * tenant is already known (from their JWT). api_keys is the one
     * exception — ApiKeyAuthFilter (acis-ingestion) must look a key up by its
     * hash *before* it knows which tenant it belongs to, which is the whole
     * point of the lookup. The extra OR clause permits that one query to see
     * rows across all tenants, gated by app.allow_api_key_lookup — a GUC only
     * ApiKeyAuthFilter ever sets (see TenantContext.setApiKeyLookupInProgress
     * and TenantAwareDataSource), and only for the instant of that query.
     * Every other read/write of this table (the Settings > API Keys CRUD,
     * and ApiKeyAuthFilter's own last-used-at update after a successful
     * lookup) goes through the normal tenant_id-matching path unaffected.
     */
    @Bean
    @Order(1001)
    public CommandLineRunner enableApiKeysRowLevelSecurity(JdbcTemplate jdbcTemplate) {
        return args -> {
            jdbcTemplate.execute("ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY");
            jdbcTemplate.execute("ALTER TABLE api_keys FORCE ROW LEVEL SECURITY");
            jdbcTemplate.execute("DROP POLICY IF EXISTS tenant_isolation ON api_keys");
            jdbcTemplate.execute("CREATE POLICY tenant_isolation ON api_keys" +
                    " USING (tenant_id::text = current_setting('app.current_tenant_id', true)" +
                    "        OR current_setting('app.allow_api_key_lookup', true) = 'true')" +
                    " WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true))");
        };
    }

    /**
     * paloalto_integrations, wazuh_integrations and sentinelone_integrations
     * need the same non-standard policy as api_keys, for the same reason:
     * IntegrationPollerService runs on a background thread with no tenant
     * context of its own, and must first ask "which tenants have this
     * integration enabled?" across every tenant before it can poll any of
     * them — gated by app.system_poller, a GUC only that poller ever sets
     * (see TenantContext.setSystemPollerInProgress and TenantAwareDataSource).
     * Every write (including the poller's own status/lastPolledAt updates)
     * still goes through WITH CHECK unmodified, since the poller sets the
     * real tenant id before saving — see IntegrationPollerService.
     */
    @Bean
    @Order(1002)
    public CommandLineRunner enableVendorPollerRowLevelSecurity(JdbcTemplate jdbcTemplate) {
        return args -> {
            for (String table : List.of("paloalto_integrations", "wazuh_integrations", "sentinelone_integrations",
                    "guardduty_integrations", "azuresentinel_integrations", "azuread_integrations", "syslog_sources")) {
                jdbcTemplate.execute("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY");
                jdbcTemplate.execute("ALTER TABLE " + table + " FORCE ROW LEVEL SECURITY");
                jdbcTemplate.execute("DROP POLICY IF EXISTS tenant_isolation ON " + table);
                jdbcTemplate.execute("CREATE POLICY tenant_isolation ON " + table +
                        " USING (tenant_id::text = current_setting('app.current_tenant_id', true)" +
                        "        OR current_setting('app.system_poller', true) = 'true')" +
                        " WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true))");
            }
        };
    }

    /**
     * invitations needs the same non-standard policy as api_keys, for the
     * same reason: the public accept-invite flow (SettingsController) must
     * look a token up by its hash *before* it knows which tenant it belongs
     * to — the caller has no JWT at all yet, since they're not a user until
     * they accept. Gated by app.allow_invitation_lookup, a GUC only that
     * lookup ever sets (see TenantContext.setInvitationLookupInProgress).
     * Every write (marking consumed, the invite's own creation) still goes
     * through WITH CHECK unmodified.
     */
    @Bean
    @Order(1003)
    public CommandLineRunner enableInvitationsRowLevelSecurity(JdbcTemplate jdbcTemplate) {
        return args -> {
            jdbcTemplate.execute("ALTER TABLE invitations ENABLE ROW LEVEL SECURITY");
            jdbcTemplate.execute("ALTER TABLE invitations FORCE ROW LEVEL SECURITY");
            jdbcTemplate.execute("DROP POLICY IF EXISTS tenant_isolation ON invitations");
            jdbcTemplate.execute("CREATE POLICY tenant_isolation ON invitations" +
                    " USING (tenant_id::text = current_setting('app.current_tenant_id', true)" +
                    "        OR current_setting('app.allow_invitation_lookup', true) = 'true')" +
                    " WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true))");
        };
    }

    /**
     * agent_enrollment_tokens needs the same non-standard policy as api_keys,
     * for the same reason: an unattended heartbeat/install script (see
     * AgentController) must look its enrollment token up by hash *before*
     * it knows which tenant it belongs to — it never has a JWT at all. Gated
     * by app.allow_agent_token_lookup, a GUC only that lookup ever sets (see
     * TenantContext.setAgentTokenLookupInProgress). Every write (admin
     * regenerating their token) still goes through WITH CHECK unmodified.
     */
    @Bean
    @Order(1004)
    public CommandLineRunner enableAgentTokenRowLevelSecurity(JdbcTemplate jdbcTemplate) {
        return args -> {
            jdbcTemplate.execute("ALTER TABLE agent_enrollment_tokens ENABLE ROW LEVEL SECURITY");
            jdbcTemplate.execute("ALTER TABLE agent_enrollment_tokens FORCE ROW LEVEL SECURITY");
            jdbcTemplate.execute("DROP POLICY IF EXISTS tenant_isolation ON agent_enrollment_tokens");
            jdbcTemplate.execute("CREATE POLICY tenant_isolation ON agent_enrollment_tokens" +
                    " USING (tenant_id::text = current_setting('app.current_tenant_id', true)" +
                    "        OR current_setting('app.allow_agent_token_lookup', true) = 'true')" +
                    " WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true))");
        };
    }
}
