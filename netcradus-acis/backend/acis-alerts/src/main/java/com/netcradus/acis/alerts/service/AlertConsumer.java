package com.netcradus.acis.alerts.service;

import com.netcradus.acis.common.dto.AlertDto;
import com.netcradus.acis.common.tenant.TenantContext;
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
        // Kafka listener threads have no HTTP request / TenantContextFilter,
        // so the tenant must be taken from the event itself for the Row Level
        // Security policy on `alerts` to see this write.
        try {
            TenantContext.setTenantId(alertDto.getTenantId());
            alertService.createAlert(alertDto);
        } finally {
            TenantContext.clear();
        }
    }
}
