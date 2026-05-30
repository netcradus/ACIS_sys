package com.netcradus.acis.log;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@org.springframework.scheduling.annotation.EnableScheduling
@org.springframework.kafka.annotation.EnableKafka
public class AcisLogApplication {
    public static void main(String[] args) {
        SpringApplication.run(AcisLogApplication.class, args);
    }
}

