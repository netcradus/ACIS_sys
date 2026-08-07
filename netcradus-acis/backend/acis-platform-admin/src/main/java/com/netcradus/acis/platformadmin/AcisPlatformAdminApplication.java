package com.netcradus.acis.platformadmin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;

import java.util.TimeZone;

// com.netcradus.acis.common.email holds the shared EmailService (real SMTP
// delivery) that TenantActivationService uses to send the real onboarding
// email a Platform Admin's "New Tenant" action triggers — outside this
// app's default @SpringBootApplication scan root, so it must be widened.
@SpringBootApplication
@ComponentScan(basePackages = { "com.netcradus.acis.platformadmin", "com.netcradus.acis.common.email" })
public class AcisPlatformAdminApplication {
    public static void main(String[] args) {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(AcisPlatformAdminApplication.class, args);
    }
}
