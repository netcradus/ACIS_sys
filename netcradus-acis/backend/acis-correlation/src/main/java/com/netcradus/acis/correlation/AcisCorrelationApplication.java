package com.netcradus.acis.correlation;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;
import java.util.TimeZone;

// RBAC model + beans live in acis-common — see AcisAlertsApplication for the same wiring.
@SpringBootApplication
@EnableScheduling
@ComponentScan(basePackages = { "com.netcradus.acis.correlation", "com.netcradus.acis.common.rbac" })
@EntityScan(basePackages = { "com.netcradus.acis.correlation", "com.netcradus.acis.common.rbac" })
@EnableJpaRepositories(basePackages = { "com.netcradus.acis.correlation", "com.netcradus.acis.common.rbac" })
public class AcisCorrelationApplication {
    public static void main(String[] args) {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(AcisCorrelationApplication.class, args);
    }
}
