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
        if (repository.count() == 0) {
            log.info("Seeding initial assets for ACIS demo...");
            
            Asset asset1 = Asset.builder()
                    .id("AS-1001")
                    .name("Main-Production-DB")
                    .type(AssetType.SERVER)
                    .ipAddress("10.0.5.20")
                    .macAddress("00:1A:2B:3C:4D:5E")
                    .status(AssetStatus.ACTIVE)
                    .owner("db-admin-01")
                    .build();

            Asset asset2 = Asset.builder()
                    .id("AS-1002")
                    .name("External-WAF-01")
                    .type(AssetType.NETWORK_DEVICE)
                    .ipAddress("185.220.101.47")
                    .macAddress("AA:BB:CC:DD:EE:FF")
                    .status(AssetStatus.ACTIVE)
                    .owner("sec-ops-01")
                    .build();

            Asset asset3 = Asset.builder()
                    .id("AS-1003")
                    .name("Employee-Workstation-HR")
                    .type(AssetType.WORKSTATION)
                    .ipAddress("192.168.1.45")
                    .macAddress("11:22:33:44:55:66")
                    .status(AssetStatus.ACTIVE)
                    .owner("hr-user-04")
                    .build();

            repository.saveAll(List.of(asset1, asset2, asset3));
            log.info("Successfully seeded {} assets", repository.count());
        }
    }
}
