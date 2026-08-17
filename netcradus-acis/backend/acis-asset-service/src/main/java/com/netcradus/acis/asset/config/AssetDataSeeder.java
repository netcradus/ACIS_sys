package com.netcradus.acis.asset.config;

import com.netcradus.acis.asset.model.Asset;
import com.netcradus.acis.asset.model.AssetStatus;
import com.netcradus.acis.asset.model.AssetType;
import com.netcradus.acis.asset.repository.AssetRepository;
import com.netcradus.acis.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;

import java.util.List;

/**
 * @Profile("!prod") — same convention acis-platform-admin's TenantSeeder
 * already uses for the identical reason: this seeder's deleteAll() runs
 * before RlsConfig's row-level-security runner (see the @Order comment
 * below), so on every restart it is genuinely unscoped and would delete
 * EVERY tenant's real asset inventory, not just demo data, if it ever ran
 * against a production database. Confirmed missing here and fixed as part
 * of the production-readiness audit - docker-compose.prod.yml must set
 * SPRING_PROFILES_ACTIVE=prod on this service for the guard to take effect,
 * matching how platform-admin's TenantSeeder is already protected.
 */
@Configuration
@RequiredArgsConstructor
@Slf4j
@Profile("!prod")
@Order(0) // must run before RlsConfig's enableRowLevelSecurity runner (Order 1000)
public class AssetDataSeeder implements CommandLineRunner {

    // Matches the tenant_id attribute seeded on the demo Keycloak users in
    // infra/keycloak/realm-acis.json (admin/analyst1/analyst2).
    private static final String DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";

    private final AssetRepository repository;

    @Override
    public void run(String... args) {
        // RLS (enabled by RlsConfig) is a permanent DB-level setting that
        // survives restarts — on every run after the first, these deletes and
        // inserts need a tenant context, even though this seeder runs before
        // RlsConfig's runner in THIS process.
        try {
            TenantContext.setTenantId(DEMO_TENANT_ID);
            seed();
        } finally {
            TenantContext.clear();
        }
    }

    private void seed() {
        log.info("Clearing corporate assets for clean seed...");
        repository.deleteAll();

        log.info("Seeding corporate assets matching screenshot...");

        repository.saveAll(List.of(
            Asset.builder()
                .tenantId(DEMO_TENANT_ID)
                .name("dc-prod-01")
                .type(AssetType.SERVER)
                .owner("it-admin")
                .criticality("HIGH")
                .tags("domain-controller,windows,prod")
                .ipAddress("192.168.1.100, 10.0.0.5")
                .os("Windows Server 2022")
                .macAddress("00:1A:2B:3C:4D:5A")
                .status(AssetStatus.ACTIVE)
                .build(),
            Asset.builder()
                .tenantId(DEMO_TENANT_ID)
                .name("fw-edge-01")
                .type(AssetType.NETWORK_DEVICE)
                .owner("netops")
                .criticality("HIGH")
                .tags("edge,palo-alto")
                .ipAddress("192.168.1.1")
                .os("PAN-OS 11.0")
                .macAddress("00:1A:2B:3C:4D:5B")
                .status(AssetStatus.ACTIVE)
                .build(),
            Asset.builder()
                .tenantId(DEMO_TENANT_ID)
                .name("laptop-332")
                .type(AssetType.WORKSTATION)
                .owner("a.sharma")
                .criticality("MEDIUM")
                .tags("exec,vip,managed")
                .ipAddress("10.200.5.42")
                .os("macOS Sequoia")
                .macAddress("00:1A:2B:3C:4D:5C")
                .status(AssetStatus.ACTIVE)
                .build(),
            Asset.builder()
                .tenantId(DEMO_TENANT_ID)
                .name("srv-erp-02")
                .type(AssetType.SERVER)
                .owner("sap-admin")
                .criticality("HIGH")
                .tags("erp,sap,prod")
                .ipAddress("10.0.12.15")
                .os("RHEL 9.2")
                .macAddress("00:1A:2B:3C:4D:5D")
                .status(AssetStatus.ACTIVE)
                .build(),
            Asset.builder()
                .tenantId(DEMO_TENANT_ID)
                .name("api-gw-prod")
                .type(AssetType.CLOUD_INSTANCE)
                .owner("devops")
                .criticality("HIGH")
                .tags("aws,api-gateway,internet-facing")
                .ipAddress("10.0.4.88")
                .os("Amazon Linux 2")
                .macAddress("00:1A:2B:3C:4D:5E")
                .status(AssetStatus.ACTIVE)
                .build(),
            Asset.builder()
                .tenantId(DEMO_TENANT_ID)
                .name("workstation-114")
                .type(AssetType.WORKSTATION)
                .owner("j.singh")
                .criticality("MEDIUM")
                .tags("managed,office")
                .ipAddress("10.0.12.44")
                .os("Windows 11 Enterprise")
                .macAddress("00:1A:2B:3C:4D:5F")
                .status(AssetStatus.ACTIVE)
                .build(),
            Asset.builder()
                .tenantId(DEMO_TENANT_ID)
                .name("backup-srv-01")
                .type(AssetType.SERVER)
                .owner("it-admin")
                .criticality("MEDIUM")
                .tags("backup,windows")
                .ipAddress("10.0.10.5")
                .os("Windows Server 2019")
                .macAddress("00:1A:2B:3C:4D:60")
                .status(AssetStatus.ACTIVE)
                .build(),
            Asset.builder()
                .tenantId(DEMO_TENANT_ID)
                .name("printer-hq-3")
                .type(AssetType.IOT_DEVICE)
                .owner("facilities")
                .criticality("LOW")
                .tags("iot,unmanaged")
                .ipAddress("192.168.20.10")
                .os("HP JetDirect")
                .macAddress("00:1A:2B:3C:4D:61")
                .status(AssetStatus.ACTIVE)
                .build(),
            Asset.builder()
                .tenantId(DEMO_TENANT_ID)
                .name("cloud-db-prod")
                .type(AssetType.CLOUD_INSTANCE)
                .owner("dba-team")
                .criticality("HIGH")
                .tags("aws-rds,prod,encrypted")
                .ipAddress("10.0.6.14")
                .os("RDS PostgreSQL")
                .macAddress("00:1A:2B:3C:4D:62")
                .status(AssetStatus.ACTIVE)
                .build(),
            Asset.builder()
                .tenantId(DEMO_TENANT_ID)
                .name("vpn-concentrator")
                .type(AssetType.NETWORK_DEVICE)
                .owner("netops")
                .criticality("HIGH")
                .tags("vpn,edge,critical")
                .ipAddress("10.0.0.1")
                .os("Cisco ASA 9.18")
                .macAddress("00:1A:2B:3C:4D:63")
                .status(AssetStatus.ACTIVE)
                .build()
        ));

        log.info("Successfully seeded {} assets", repository.count());
    }
}
