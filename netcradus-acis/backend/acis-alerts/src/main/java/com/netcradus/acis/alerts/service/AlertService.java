package com.netcradus.acis.alerts.service;

import com.netcradus.acis.alerts.model.Alert;
import com.netcradus.acis.alerts.repository.AlertRepository;
import com.netcradus.acis.common.dto.AlertDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Random;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AlertService {

    private final AlertRepository repository;
    private final SimpMessagingTemplate messagingTemplate;
    private final Random random = new Random();

    @Transactional
    public Alert createAlert(AlertDto dto) {
        String id = "AL-" + (1000 + random.nextInt(9000));
        Alert alert = Alert.builder()
                .id(id)
                .tenantId(dto.getTenantId())
                .title(dto.getTitle())
                .severity(dto.getSeverity())
                .source(dto.getSource())
                .status("OPEN")
                .rawEvent(dto.getRawEvent())
                .build();

        Alert saved = repository.save(alert);
        log.info("Saved alert: {}", saved.getId());

        // Push to WebSocket
        messagingTemplate.convertAndSend("/topic/alerts", convertToDto(saved));
        messagingTemplate.convertAndSend("/topic/dashboard", "new-alert");

        return saved;
    }

    public List<AlertDto> findAll(String tenantId) {
        List<Alert> results = repository.findByTenantIdOrderByCreatedAtDesc(tenantId);
        // Fallback: if no alerts found for the given tenant, return ALL alerts
        // (covers demo/dev mode where tenant_id claim is not yet populated in JWT)
        if (results.isEmpty()) {
            results = repository.findAll(org.springframework.data.domain.Sort.by(
                org.springframework.data.domain.Sort.Direction.DESC, "createdAt"));
        }
        return results.stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    private AlertDto convertToDto(Alert alert) {
        return AlertDto.builder()
                .id(alert.getId())
                .tenantId(alert.getTenantId())
                .title(alert.getTitle())
                .severity(alert.getSeverity())
                .source(alert.getSource())
                .status(alert.getStatus())
                .ownerId(alert.getOwnerId())
                .rawEvent(alert.getRawEvent())
                .createdAt(alert.getCreatedAt())
                .updatedAt(alert.getUpdatedAt())
                .build();
    }
}
