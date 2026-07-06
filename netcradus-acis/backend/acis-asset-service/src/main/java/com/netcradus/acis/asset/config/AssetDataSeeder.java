package com.netcradus.acis.asset.config;

import com.netcradus.acis.asset.model.Asset;
import com.netcradus.acis.asset.model.AssetStatus;
import com.netcradus.acis.asset.model.AssetType;
import com.netcradus.acis.asset.repository.AssetRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class AssetDataSeeder implements CommandLineRunner {

    private final AssetRepository repository;

    @Override
    public void run(String... args) {
        log.info("Clearing corporate assets for clean seed...");
        repository.deleteAll();

        log.info("Seeding corporate assets matching screenshot...");

        repository.saveAll(List.of(
            Asset.builder()
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
