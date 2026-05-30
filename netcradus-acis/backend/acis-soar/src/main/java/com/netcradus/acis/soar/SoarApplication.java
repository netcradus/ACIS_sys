package com.netcradus.acis.soar;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class SoarApplication {
    public static void main(String[] args) {
        SpringApplication.run(SoarApplication.class, args);
    }
}
