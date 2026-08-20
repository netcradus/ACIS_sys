package com.netcradus.acis.soar.config;

import com.netcradus.acis.common.dto.AlertDto;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.boot.autoconfigure.kafka.KafkaProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.support.serializer.JsonDeserializer;

import java.util.Map;

/**
 * acis-soar's default Kafka consumer factory (see application.yml's
 * spring.kafka.consumer.properties) hard-codes
 * spring.json.value.default.type=AuditEvent for AuditEventConsumer, the only
 * consumer that existed before this one. A plain @KafkaListener for AlertDto
 * would try to deserialize acis.alerts messages as AuditEvent and break, so
 * RedTeamDetectionConsumer needs its own dedicated factory targeting AlertDto
 * explicitly instead.
 */
@Configuration
public class AlertKafkaConsumerConfig {

    @Bean
    public ConsumerFactory<String, AlertDto> alertDtoConsumerFactory(KafkaProperties kafkaProperties) {
        JsonDeserializer<AlertDto> deserializer = new JsonDeserializer<>(AlertDto.class);
        deserializer.addTrustedPackages("*");
        deserializer.setUseTypeHeaders(false);
        Map<String, Object> props = kafkaProperties.buildConsumerProperties(null);
        return new DefaultKafkaConsumerFactory<>(props, new StringDeserializer(), deserializer);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, AlertDto> alertDtoKafkaListenerContainerFactory(
            ConsumerFactory<String, AlertDto> alertDtoConsumerFactory) {
        ConcurrentKafkaListenerContainerFactory<String, AlertDto> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(alertDtoConsumerFactory);
        return factory;
    }
}
