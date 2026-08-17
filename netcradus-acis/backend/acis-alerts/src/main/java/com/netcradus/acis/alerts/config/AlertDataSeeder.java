package com.netcradus.acis.alerts.config;

import com.netcradus.acis.alerts.model.Alert;
import com.netcradus.acis.alerts.repository.AlertRepository;
import com.netcradus.acis.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;

import java.util.List;

// Same convention as TenantSeeder/AssetDataSeeder - added during the
// production-readiness audit. This inserts demo alert rows on every fresh
// (empty-table) boot with no guard at all; a production deployment's first
// startup has an empty alerts table too, so without this it would silently
// seed fake demo alerts into a real tenant's incident queue.
@Configuration
@Profile("!prod")
@RequiredArgsConstructor
@Slf4j
@Order(0) // must run before RlsConfig's enableRowLevelSecurity runner (Order 1000)
public class AlertDataSeeder implements CommandLineRunner {

    // Matches the tenant_id attribute seeded on the demo Keycloak users in
    // infra/keycloak/realm-acis.json (admin/analyst1/analyst2).
    private static final String DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";

    private final AlertRepository repository;

    @Override
    public void run(String... args) {
        // RLS (enabled by RlsConfig) is a permanent DB-level setting that
        // survives restarts — on every run after the first, these inserts
        // need a tenant context even though this seeder itself runs before
        // RlsConfig's runner in THIS process.
        try {
            TenantContext.setTenantId(DEMO_TENANT_ID);
            seed();
        } finally {
            TenantContext.clear();
        }
    }

    private void seed() {
        // Confirmed live: this used to call repository.deleteAll() on every
        // single boot, unconditionally — meaning any real alert a tenant
        // received via the real Kafka/correlation pipeline between restarts
        // was destroyed and silently replaced with these 11 fixed demo rows
        // on the next deploy. Only seed an empty table now.
        if (repository.count() > 0) {
            return;
        }
        log.info("Seeding initial alerts for ACIS demo matching screenshot...");

            Alert a1 = Alert.builder()
                    .id("AL-1000")
                    .tenantId(DEMO_TENANT_ID)
                    .title("Credential stuffing spikes: 800+ failures/min")
                    .severity("CRITICAL")
                    .source("EDR")
                    .status("OPEN")
                    .ownerId("analyst1")
                    .rawEvent("{\"EventID\": 4625, \"src_ip\": \"10.0.12.44\", \"user\": \"j.singh\", \"target\": \"dc-prod-01 (Domain Controller)\", \"failures\": 847, \"window\": \"60s\"}")
                    .build();

            Alert a2 = Alert.builder()
                    .id("AL-1001")
                    .tenantId(DEMO_TENANT_ID)
                    .title("Beaconing to rare domain cdn-x7.io")
                    .severity("HIGH")
                    .source("FW")
                    .status("INVESTIGATING")
                    .ownerId("analyst2")
                    .rawEvent("{\"EventID\": 3, \"src_ip\": \"10.0.12.50\", \"destination\": \"185.199.110.153\", \"domain\": \"cdn-x7.io\", \"bytes_sent\": 15430, \"protocol\": \"DNS\"}")
                    .build();

            Alert a3 = Alert.builder()
                    .id("AL-1002")
                    .tenantId(DEMO_TENANT_ID)
                    .title("Credential stuffing spikes: 800+ failures/min")
                    .severity("HIGH")
                    .source("Proxy")
                    .status("MITIGATED")
                    .ownerId("analyst3")
                    .rawEvent("{\"EventID\": 4625, \"src_ip\": \"10.0.12.45\", \"user\": \"admin\", \"target\": \"web-portal\", \"failures\": 912, \"window\": \"60s\"}")
                    .build();

            Alert a4 = Alert.builder()
                    .id("AL-1003")
                    .tenantId(DEMO_TENANT_ID)
                    .title("Beaconing to rare domain cdn-x7.io")
                    .severity("CRITICAL")
                    .source("Email")
                    .status("OPEN")
                    .ownerId("analyst1")
                    .rawEvent("{\"EventID\": 12, \"src_ip\": \"10.0.12.80\", \"sender\": \"malicious@phish.net\", \"subject\": \"Urgent Security Update Needed\"}")
                    .build();

            Alert a5 = Alert.builder()
                    .id("AL-1004")
                    .tenantId(DEMO_TENANT_ID)
                    .title("Credential stuffing spikes: 800+ failures/min")
                    .severity("LOW")
                    .source("EDR")
                    .status("INVESTIGATING")
                    .ownerId("analyst2")
                    .rawEvent("{\"EventID\": 4625, \"src_ip\": \"10.0.12.92\", \"user\": \"test-user\", \"target\": \"exchange-server\", \"failures\": 815, \"window\": \"60s\"}")
                    .build();

            Alert a6 = Alert.builder()
                    .id("AL-1005")
                    .tenantId(DEMO_TENANT_ID)
                    .title("Beaconing to rare domain cdn-x7.io")
                    .severity("MEDIUM")
                    .source("FW")
                    .status("MITIGATED")
                    .ownerId("analyst3")
                    .rawEvent("{\"EventID\": 3, \"src_ip\": \"10.0.12.51\", \"destination\": \"185.199.110.154\", \"domain\": \"cdn-x7.io\", \"bytes_sent\": 8430, \"protocol\": \"DNS\"}")
                    .build();

            Alert a7 = Alert.builder()
                    .id("AL-1006")
                    .tenantId(DEMO_TENANT_ID)
                    .title("Credential stuffing spikes: 800+ failures/min")
                    .severity("HIGH")
                    .source("Proxy")
                    .status("OPEN")
                    .ownerId("analyst1")
                    .rawEvent("{\"EventID\": 4625, \"src_ip\": \"10.0.12.44\", \"user\": \"j.singh\", \"target\": \"dc-prod-01\", \"failures\": 847, \"window\": \"60s\"}")
                    .build();

            Alert a8 = Alert.builder()
                    .id("AL-1007")
                    .tenantId(DEMO_TENANT_ID)
                    .title("Beaconing to rare domain cdn-x7.io")
                    .severity("CRITICAL")
                    .source("Email")
                    .status("INVESTIGATING")
                    .ownerId("analyst2")
                    .rawEvent("{\"EventID\": 12, \"src_ip\": \"10.0.12.80\", \"sender\": \"phisher@attack.org\", \"subject\": \"Action Required: Payroll confirmation\"}")
                    .build();

            Alert a9 = Alert.builder()
                    .id("AL-1008")
                    .tenantId(DEMO_TENANT_ID)
                    .title("Suspicious ASR bypass via LOLBin")
                    .severity("LOW")
                    .source("EDR")
                    .status("MITIGATED")
                    .ownerId("analyst3")
                    .rawEvent("{\"EventID\": 1, \"process\": \"powershell.exe\", \"parent_process\": \"cmd.exe\", \"bypass_arg\": \"-nop -w hidden -c \\\"IEX (New-Object Net.WebClient).DownloadString...\\\"\"}")
                    .build();

            Alert a10 = Alert.builder()
                    .id("AL-1009")
                    .tenantId(DEMO_TENANT_ID)
                    .title("Beaconing to rare domain cdn-x7.io")
                    .severity("MEDIUM")
                    .source("FW")
                    .status("OPEN")
                    .ownerId("analyst1")
                    .rawEvent("{\"EventID\": 3, \"src_ip\": \"10.0.12.50\", \"destination\": \"185.199.110.153\", \"domain\": \"cdn-x7.io\", \"bytes_sent\": 12400, \"protocol\": \"DNS\"}")
                    .build();

            Alert a11 = Alert.builder()
                    .id("AL-1010")
                    .tenantId(DEMO_TENANT_ID)
                    .title("Impossible travel detected Mumbai→London")
                    .severity("HIGH")
                    .source("IAM")
                    .status("INVESTIGATING")
                    .ownerId("analyst2")
                    .rawEvent("{\"EventID\": 4624, \"user\": \"a.patel\", \"login_1_city\": \"Mumbai\", \"login_2_city\": \"London\", \"time_diff_minutes\": 15, \"src_ip_1\": \"115.110.15.22\", \"src_ip_2\": \"82.165.23.44\"}")
                    .build();

            repository.saveAll(List.of(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11));
            log.info("Successfully seeded {} alerts", repository.count());
    }
}
