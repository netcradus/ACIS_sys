package com.netcradus.acis.soar;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableAsync
@EnableScheduling
// ApiKey/ApiKeyRepository and SyslogSource/SyslogSourceRepository live in
// acis-common (shared with acis-ingestion — the API key auth filter and the
// syslog listener, respectively), outside this app's default
// @SpringBootApplication scan root — extend entity/repository scanning to pick them up.
@EntityScan(basePackages = { "com.netcradus.acis.soar", "com.netcradus.acis.common.apikey", "com.netcradus.acis.common.syslog" })
@EnableJpaRepositories(basePackages = { "com.netcradus.acis.soar", "com.netcradus.acis.common.apikey", "com.netcradus.acis.common.syslog" })
public class SoarApplication {
    public static void main(String[] args) {
        // Fix for PostgreSQL 16 timezone alias handling on some OS locales
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(SoarApplication.class, args);
    }
}
