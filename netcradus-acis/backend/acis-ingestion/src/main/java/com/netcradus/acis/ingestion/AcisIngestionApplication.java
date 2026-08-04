package com.netcradus.acis.ingestion;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

// ApiKey/ApiKeyRepository live in acis-common (shared with acis-soar's key
// management CRUD) — outside this app's default @SpringBootApplication scan
// root, so entity/repository scanning must be extended explicitly.
@SpringBootApplication
@EntityScan(basePackages = { "com.netcradus.acis.ingestion", "com.netcradus.acis.common.apikey" })
@EnableJpaRepositories(basePackages = { "com.netcradus.acis.ingestion", "com.netcradus.acis.common.apikey" })
public class AcisIngestionApplication {
    public static void main(String[] args) {
        // Fix for PostgreSQL 16 timezone alias handling on some OS locales
        // (see SoarApplication for the same fix) — this service previously
        // had no datasource at all, so it never hit this until now.
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(AcisIngestionApplication.class, args);
    }
}
