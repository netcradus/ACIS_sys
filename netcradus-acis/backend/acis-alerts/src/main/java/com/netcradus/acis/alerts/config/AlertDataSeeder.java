package com.netcradus.acis.alerts.config;

import com.netcradus.acis.alerts.model.Alert;
import com.netcradus.acis.alerts.repository.AlertRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class AlertDataSeeder implements CommandLineRunner {

    private final AlertRepository repository;

    @Override
    public void run(String... args) {
        if (repository.count() == 0) {
            log.info("Seeding initial alerts for ACIS demo...");
            
            Alert alert1 = Alert.builder()
                    .id("AL-9421")
                    .tenantId("tenant-01")
                    .title("Suspicious Outbound Connection to C2 Server")
                    .severity("CRITICAL")
                    .source("netcradus-ids")
                    .status("OPEN")
                    .build();

            Alert alert2 = Alert.builder()
                    .id("AL-5210")
                    .tenantId("tenant-01")
                    .title("Multiple Failed Login Attempts — Domain Controller")
                    .severity("HIGH")
                    .source("auth-service")
                    .status("OPEN")
                    .build();

            Alert alert3 = Alert.builder()
                    .id("AL-3109")
                    .tenantId("tenant-01")
                    .title("Unauthorized Access to Restricted S3 Bucket")
                    .severity("MEDIUM")
                    .source("cloud-trail")
                    .status("INVESTIGATING")
                    .build();

            repository.saveAll(List.of(alert1, alert2, alert3));
            log.info("Successfully seeded {} alerts", repository.count());
        }
    }
}
