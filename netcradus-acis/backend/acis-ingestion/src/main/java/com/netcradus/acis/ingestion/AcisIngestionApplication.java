package com.netcradus.acis.ingestion;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;

// ApiKey/ApiKeyRepository and SyslogSource/SyslogSourceRepository live in
// acis-common (shared with acis-soar's key management / syslog-source CRUD)
// — outside this app's default @SpringBootApplication scan root, so
// entity/repository scanning must be extended explicitly.
//
// com.netcradus.acis.common.rbac added during the production-readiness
// audit, same as acis-log-service's AcisLogApplication - SecurityConfig now
// wires a real RbacEnforcementFilter here, which needs PermissionResolver
// AND its own dependency UserMemberRepository (a JPA repository, so it
// needs @EntityScan/@EnableJpaRepositories too, not just @ComponentScan -
// confirmed live: with only @ComponentScan this still failed to start with
// "no bean of type UserMemberRepository found").
@SpringBootApplication
@EnableScheduling
@EntityScan(basePackages = { "com.netcradus.acis.ingestion", "com.netcradus.acis.common.apikey", "com.netcradus.acis.common.syslog", "com.netcradus.acis.common.rbac" })
@EnableJpaRepositories(basePackages = { "com.netcradus.acis.ingestion", "com.netcradus.acis.common.apikey", "com.netcradus.acis.common.syslog", "com.netcradus.acis.common.rbac" })
@ComponentScan(basePackages = { "com.netcradus.acis.ingestion", "com.netcradus.acis.common.rbac" })
public class AcisIngestionApplication {
    public static void main(String[] args) {
        // Fix for PostgreSQL 16 timezone alias handling on some OS locales
        // (see SoarApplication for the same fix) — this service previously
        // had no datasource at all, so it never hit this until now.
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(AcisIngestionApplication.class, args);
    }
}
