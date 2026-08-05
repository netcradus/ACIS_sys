package com.netcradus.acis.log;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import java.util.TimeZone;

// RBAC model + beans live in acis-common — see AcisAlertsApplication for the
// same wiring; this is the first Postgres connection this service has ever opened.
@SpringBootApplication
@org.springframework.scheduling.annotation.EnableScheduling
@org.springframework.kafka.annotation.EnableKafka
@ComponentScan(basePackages = { "com.netcradus.acis.log", "com.netcradus.acis.common.rbac" })
@EntityScan(basePackages = { "com.netcradus.acis.log", "com.netcradus.acis.common.rbac" })
@EnableJpaRepositories(basePackages = { "com.netcradus.acis.log", "com.netcradus.acis.common.rbac" })
public class AcisLogApplication {
    public static void main(String[] args) {
        // Fix for PostgreSQL 16 timezone alias handling on some OS locales
        // (see SoarApplication for the same fix).
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(AcisLogApplication.class, args);
    }
}

