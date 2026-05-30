package com.netcradus.acis.correlation.service;

import com.netcradus.acis.common.dto.AlertDto;
import com.netcradus.acis.common.dto.NormalizedEvent;
import com.netcradus.acis.correlation.model.CorrelationRule;
import com.netcradus.acis.correlation.repository.CorrelationRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class CorrelationEngine {

    private final CorrelationRuleRepository ruleRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @KafkaListener(topics = "acis.raw.events", groupId = "acis-correlation-group")
    public void processEvent(NormalizedEvent event) {
        log.debug("Processing event for correlation: {}", event.getEventId());

        List<CorrelationRule> activeRules = ruleRepository.findByEnabledTrue();

        for (CorrelationRule rule : activeRules) {
            if (evaluateRule(rule, event)) {
                triggerAlert(rule, event);
            }
        }
    }

    private boolean evaluateRule(CorrelationRule rule, NormalizedEvent event) {
        // Simple mock matching logic for Phase 3
        // In a real system, this would be a full SPL/SQL engine or Flink CEP
        String query = rule.getSplQuery().toLowerCase();
        
        // Example logic: if query contains "login" and event action is "login_failed"
        if (query.contains("login") && "login_failed".equalsIgnoreCase(event.getAction())) {
            return true;
        }
        
        // Example logic: if query contains "admin" and event user is "admin"
        if (query.contains("admin") && "admin".equalsIgnoreCase(event.getUser())) {
            return true;
        }

        // Generic keyword match in raw data
        if (query.contains("suspicious") && event.getRaw() != null && event.getRaw().toLowerCase().contains("suspicious")) {
            return true;
        }

        return false;
    }

    private void triggerAlert(CorrelationRule rule, NormalizedEvent event) {
        log.info("Rule matched! Triggering alert: {} for tenant: {}", rule.getName(), event.getTenantId());

        AlertDto alert = AlertDto.builder()
                .tenantId(event.getTenantId())
                .title("Detection: " + rule.getName())
                .severity(rule.getSeverity())
                .source("Correlation Engine")
                .status("OPEN")
                .build();

        kafkaTemplate.send("acis.alerts", alert);
        
        rule.setLastRunAt(LocalDateTime.now());
        ruleRepository.save(rule);
    }
}
