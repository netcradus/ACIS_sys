package com.netcradus.acis.soar;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class SoarApplication {
    public static void main(String[] args) {
        // Fix for PostgreSQL 16 timezone alias handling on some OS locales
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(SoarApplication.class, args);
    }
}
