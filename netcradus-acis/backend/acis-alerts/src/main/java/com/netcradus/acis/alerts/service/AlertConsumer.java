package com.netcradus.acis.alerts.service;

import com.netcradus.acis.common.dto.AlertDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class AlertConsumer {

    private final AlertService alertService;

    @KafkaListener(topics = "acis.alerts", groupId = "acis-alerts-group")
    public void consume(AlertDto alertDto) {
        log.info("Received alert signal from Kafka: {}", alertDto.getTitle());
        alertService.createAlert(alertDto);
    }
}
