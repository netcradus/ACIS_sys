package com.netcradus.acis.alerts;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import java.util.TimeZone;

@SpringBootApplication
public class AcisAlertsApplication {
    public static void main(String[] args) {
        // Fix for PostgreSQL 16 TimeZone issues in certain environments
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(AcisAlertsApplication.class, args);
    }
}
