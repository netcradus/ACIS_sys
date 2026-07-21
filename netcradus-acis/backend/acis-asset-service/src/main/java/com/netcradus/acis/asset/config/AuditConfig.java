package com.netcradus.acis.asset.config;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;

@Configuration
public class AuditConfig {

    @Bean
    public AuditEventPublisher auditEventPublisher(KafkaTemplate<String, Object> kafkaTemplate) {
        return new AuditEventPublisher(kafkaTemplate);
    }
}
