package com.netcradus.acis.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling   // needed by RateLimiterFilter's @Scheduled reset
public class AcisGatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(AcisGatewayApplication.class, args);
    }
}
