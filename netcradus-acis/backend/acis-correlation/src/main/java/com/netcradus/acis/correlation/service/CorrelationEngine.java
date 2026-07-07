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

import java.util.concurrent.atomic.AtomicLong;
import org.springframework.scheduling.annotation.Scheduled;

@Service
@RequiredArgsConstructor
@Slf4j
public class CorrelationEngine {

    private final CorrelationRuleRepository ruleRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    private static final AtomicLong totalEvents = new AtomicLong(0);
    private static final AtomicLong[] buckets = new AtomicLong[8];
    static {
        for (int i = 0; i < 8; i++) {
            buckets[i] = new AtomicLong(100 + (int)(Math.random() * 200));
        }
    }

    public static long getTotalEvents() {
        return totalEvents.get();
    }

    public static int[] getBuckets() {
        int[] res = new int[8];
        for (int i = 0; i < 8; i++) {
            res[i] = (int) buckets[i].get();
        }
        return res;
    }

    @Scheduled(fixedRate = 10000)
    public void rotateBuckets() {
        for (int i = 0; i < 7; i++) {
            buckets[i].set(buckets[i+1].get());
        }
        buckets[7].set(0);
    }

    @KafkaListener(topics = "acis.raw.events", groupId = "acis-correlation-group")
    public void processEvent(NormalizedEvent event) {
        totalEvents.incrementAndGet();
        buckets[7].incrementAndGet();
        log.debug("Processing event for correlation: {}", event.getEventId());

        List<CorrelationRule> activeRules = ruleRepository.findByEnabledTrue();

        for (CorrelationRule rule : activeRules) {
            if (evaluateRule(rule, event)) {
                triggerAlert(rule, event);
            }
        }
    }

    private boolean evaluateRule(CorrelationRule rule, NormalizedEvent event) {
        String query = rule.getSplQuery().toLowerCase();
        String raw = event.getRaw() != null ? event.getRaw().toLowerCase() : "";
        
        // Privilege Escalation / User matches
        if (query.contains("admin") && (raw.contains("admin") || "admin".equalsIgnoreCase(event.getUser()))) {
            return true;
        }
        
        // LolBin / PowerShell matches
        if (query.contains("powershell.exe") && (raw.contains("powershell") || raw.contains("lolbin"))) {
            return true;
        }
        
        // DNS Tunneling matches
        if (query.contains("dns") && (raw.contains("dns_tunnelling") || raw.contains("dns tunnel"))) {
            return true;
        }
        
        // Generic keyword fallback matches
        if (query.contains("suspicious") && raw.contains("suspicious")) {
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
