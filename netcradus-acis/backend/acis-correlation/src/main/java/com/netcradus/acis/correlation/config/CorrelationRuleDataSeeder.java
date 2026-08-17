package com.netcradus.acis.correlation.config;

import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.correlation.model.CorrelationRule;
import com.netcradus.acis.correlation.repository.CorrelationRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

// Same convention as TenantSeeder/AssetDataSeeder - added during the
// production-readiness audit. Without this, a fresh production deployment's
// first (empty-table) boot silently seeds demo correlation rules into a
// real tenant.
@Component
@Profile("!prod")
@RequiredArgsConstructor
@Slf4j
@Order(0) // must run before RlsConfig's enableRowLevelSecurity runner (Order 1000)
public class CorrelationRuleDataSeeder implements CommandLineRunner {

    // Matches the tenant_id attribute seeded on the demo Keycloak users in
    // infra/keycloak/realm-acis.json (admin/analyst1/analyst2).
    private static final String DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";

    private final CorrelationRuleRepository repository;

    @Override
    public void run(String... args) throws Exception {
        // RLS (enabled by RlsConfig) is a permanent DB-level setting that
        // survives restarts — on every run after the first, repository.count()
        // and the seed insert both need a tenant context, even though this
        // seeder runs before RlsConfig's runner in THIS process.
        try {
            TenantContext.setTenantId(DEMO_TENANT_ID);
            seed();
        } finally {
            TenantContext.clear();
        }
    }

    private void seed() {
        if (repository.count() == 0) {
            log.info("Seeding correlation rules from the screenshot...");

            repository.saveAll(List.of(
                CorrelationRule.builder()
                    .tenantId(DEMO_TENANT_ID)
                    .name("Impossible Travel Detection")
                    .description("Risk-based alerting - schedule & throttling")
                    .splQuery("index=auth sourcetype=okta:login | stats values(src_ip) as ips, values(geo_city) as cities by user | where mvcount(cities) > 1")
                    .severity("HIGH")
                    .riskScore(75)
                    .enabled(true)
                    .build(),
                CorrelationRule.builder()
                    .tenantId(DEMO_TENANT_ID)
                    .name("Privilege Escalation on DC")
                    .description("Detect creation or addition of users to admin groups")
                    .splQuery("index=windows sourcetype=WinEventLog:Security EventCode=4720 OR EventCode=4732 | search TargetUserName=\"Admin\"")
                    .severity("CRITICAL")
                    .riskScore(98)
                    .enabled(true)
                    .build(),
                CorrelationRule.builder()
                    .tenantId(DEMO_TENANT_ID)
                    .name("Excessive 401 Failures (Brute Force)")
                    .description("Detect high frequency of authentication failures")
                    .splQuery("index=web sourcetype=access_combined status=401 | stats count by clientip | where count > 100")
                    .severity("HIGH")
                    .riskScore(85)
                    .enabled(true)
                    .build(),
                CorrelationRule.builder()
                    .tenantId(DEMO_TENANT_ID)
                    .name("Suspicious ASR Bypass via LOLBin")
                    .description("Detect execution of scripts or bypass tools")
                    .splQuery("index=endpoint sourcetype=process_creation parent_process=\"cmd.exe\" (process=\"powershell.exe\" OR process=\"certutil.exe\")")
                    .severity("HIGH")
                    .riskScore(88)
                    .enabled(true)
                    .build(),
                CorrelationRule.builder()
                    .tenantId(DEMO_TENANT_ID)
                    .name("Beaconing to Rare External Domain")
                    .description("Periodic egress connections to rare domains")
                    .splQuery("index=network sourcetype=dns | stats count, avg(bytes) by query | where count > 1000")
                    .severity("MEDIUM")
                    .riskScore(48)
                    .enabled(false)
                    .build(),
                CorrelationRule.builder()
                    .tenantId(DEMO_TENANT_ID)
                    .name("Data Exfiltration via DNS Tunneling")
                    .description("High DNS TXT queries suggesting tunneling")
                    .splQuery("index=network sourcetype=dns query_length > 100 | stats count by src_ip | where count > 50")
                    .severity("HIGH")
                    .riskScore(88)
                    .enabled(false)
                    .build()
            ));

            log.info("Correlation rules seeded successfully!");
        }
    }
}
