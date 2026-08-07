package com.netcradus.acis.platformadmin.config;

import com.netcradus.acis.platformadmin.model.Tenant;
import com.netcradus.acis.platformadmin.model.TenantModule;
import com.netcradus.acis.platformadmin.model.TenantStatus;
import com.netcradus.acis.platformadmin.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.UUID;

/**
 * Seeds a tenants row for the pre-existing demo tenant UUID (the same
 * constant used across every other service's seeders, e.g.
 * acis-asset-service's AssetDataSeeder) so existing tenant-scoped data
 * isn't orphaned once this registry exists.
 *
 * @Profile("!prod") — this is the platform-wide Tenants list a real
 * operator uses to see every real customer; without this guard, a fake
 * "Acme Corp (Demo)" row would sit there indistinguishable from a real
 * tenant on every environment, including production (confirmed live:
 * docker-compose.prod.yml previously activated no Spring profile at all,
 * so this ran identically there). See docker-compose.prod.yml's
 * platform-admin service for where SPRING_PROFILES_ACTIVE=prod is now set.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@Order(1000)
@Profile("!prod")
public class TenantSeeder implements CommandLineRunner {

    private static final UUID DEMO_TENANT_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");

    private final TenantRepository tenantRepository;

    @Override
    public void run(String... args) {
        if (tenantRepository.existsById(DEMO_TENANT_ID)) {
            return;
        }
        Tenant tenant = new Tenant();
        tenant.setId(DEMO_TENANT_ID);
        tenant.setName("Acme Corp (Demo)");
        tenant.setSlug("acme-demo");
        tenant.setStatus(TenantStatus.ACTIVE);
        tenant.setPlanName("Enterprise Shield");
        tenant.setEnabledModules(EnumSet.allOf(TenantModule.class));
        tenant.setContactEmail("admin@acme.local");
        tenant.setContactName("ACIS Admin");
        tenantRepository.save(tenant);
        log.info("Seeded platform tenant registry with existing demo tenant {}", DEMO_TENANT_ID);
    }
}
