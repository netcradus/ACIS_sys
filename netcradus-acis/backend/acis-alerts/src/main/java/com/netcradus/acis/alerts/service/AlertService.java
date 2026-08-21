package com.netcradus.acis.alerts.service;

import com.netcradus.acis.alerts.model.Alert;
import com.netcradus.acis.alerts.repository.AlertRepository;
import com.netcradus.acis.common.dto.AlertDto;
import com.netcradus.acis.common.exception.NotFoundException;
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
    private final AnomalyScoringService anomalyScoringService;
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
                .eventOccurredAt(dto.getEventOccurredAt())
                .riskScore(dto.getRiskScore())
                .mitreTechniques(dto.getMitreTechniques())
                .redTeamExecutionId(dto.getRedTeamExecutionId())
                .iocMatched(dto.getIocMatched())
                .iocSeverity(dto.getIocSeverity())
                .iocSource(dto.getIocSource())
                .build();

        anomalyScoringService.score(dto).ifPresent(result -> {
            alert.setAnomalyScore(result.score());
            alert.setIsAnomaly(result.isAnomaly());
            alert.setAnomalyFeatures(result.topFeatures());
        });

        Alert saved = repository.save(alert);
        log.info("Saved alert: {}", saved.getId());

        // Push to WebSocket
        messagingTemplate.convertAndSend("/topic/alerts", convertToDto(saved));
        messagingTemplate.convertAndSend("/topic/dashboard", "new-alert");

        return saved;
    }

    public List<AlertDto> findAll(String tenantId) {
        List<Alert> results = repository.findByTenantIdOrderByCreatedAtDesc(tenantId);
        return results.stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    /**
     * Real status-change write + broadcast — previously AlertController's
     * updateStatus called alertRepository.save() directly, bypassing this
     * service entirely, which is why only createAlert ever broadcast over
     * WebSocket. Status/owner changes now reach /topic/alerts too, so the
     * panel reflects them live instead of silently dropping the message.
     */
    @Transactional
    public Alert updateStatus(String id, String status, String tenantId) {
        Alert alert = repository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Alert not found"));
        alert.setStatus(status);
        return saveAndBroadcast(alert);
    }

    /** Real persist + broadcast for an already-mutated Alert — reused by AlertController's generic PUT /{id} after it applies/validates the requested field changes. */
    @Transactional
    public Alert saveAndBroadcast(Alert alert) {
        Alert saved = repository.save(alert);
        messagingTemplate.convertAndSend("/topic/alerts", convertToDto(saved));
        return saved;
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
                .confirmedCategory(alert.getConfirmedCategory())
                .labeledAt(alert.getLabeledAt())
                .eventOccurredAt(alert.getEventOccurredAt())
                .anomalyScore(alert.getAnomalyScore())
                .isAnomaly(alert.getIsAnomaly())
                .anomalyFeatures(alert.getAnomalyFeatures())
                .riskScore(alert.getRiskScore())
                .mitreTechniques(alert.getMitreTechniques())
                .redTeamExecutionId(alert.getRedTeamExecutionId())
                .iocMatched(alert.getIocMatched())
                .iocSeverity(alert.getIocSeverity())
                .iocSource(alert.getIocSource())
                .build();
    }
}
