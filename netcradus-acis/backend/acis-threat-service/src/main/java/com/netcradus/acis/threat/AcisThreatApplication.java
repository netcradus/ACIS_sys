package com.netcradus.acis.threat;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import java.util.TimeZone;

// RBAC model + beans live in acis-common — see AcisAlertsApplication for the same wiring.
@SpringBootApplication
@ComponentScan(basePackages = { "com.netcradus.acis.threat", "com.netcradus.acis.common.rbac" })
@EntityScan(basePackages = { "com.netcradus.acis.threat", "com.netcradus.acis.common.rbac" })
@EnableJpaRepositories(basePackages = { "com.netcradus.acis.threat", "com.netcradus.acis.common.rbac" })
public class AcisThreatApplication {
    public static void main(String[] args) {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(AcisThreatApplication.class, args);
    }
}
