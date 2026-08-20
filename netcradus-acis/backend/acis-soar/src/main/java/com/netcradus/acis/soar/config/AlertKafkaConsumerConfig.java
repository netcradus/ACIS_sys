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
        // Real crash found on a live deploy: kafkaProperties.buildConsumerProperties()
        // carries the whole spring.kafka.consumer.properties block, including
        // application.yml's spring.json.* keys (set there for the OTHER
        // consumer, AuditEventConsumer's AuditEvent default-type). Spring
        // Kafka's JsonDeserializer.configure() hard-rejects being configured
        // both that way AND via the explicit setter calls above ("must be
        // configured with property setters, or via configuration properties;
        // not both") - it doesn't just prefer one, it throws and the whole
        // service fails to start. Strip the JSON-deserializer-specific keys
        // so only the explicit setters above apply, keeping the rest of the
        // shared connection properties (bootstrap-servers etc.) intact.
        Map<String, Object> props = kafkaProperties.buildConsumerProperties(null);
        props.remove("spring.json.value.default.type");
        props.remove("spring.json.use.type.headers");
        props.remove("spring.json.trusted.packages");
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
