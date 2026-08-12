package com.netcradus.acis.correlation.controller;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.CorrelationRuleDto;
import com.netcradus.acis.common.exception.NotFoundException;
import com.netcradus.acis.correlation.model.CorrelationRule;
import com.netcradus.acis.correlation.repository.CorrelationRuleRepository;
import com.netcradus.acis.correlation.service.CorrelationEngine;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/correlation")
@RequiredArgsConstructor
public class CorrelationController {

    private final CorrelationRuleRepository repository;
    private final CorrelationEngine correlationEngine;
    private final AuditEventPublisher auditEventPublisher;

    @GetMapping("/rules")
    public List<CorrelationRuleDto> getRules(@RequestHeader("X-Tenant-ID") String tenantId) {
        return repository.findByTenantId(tenantId).stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @PostMapping("/rules")
    public CorrelationRule createRule(@RequestBody CorrelationRuleDto dto, @RequestHeader("X-Tenant-ID") String tenantId) {
        CorrelationRule rule = CorrelationRule.builder()
                .tenantId(tenantId)
                .name(dto.getName())
                .description(dto.getDescription())
                .splQuery(dto.getSplQuery())
                .severity(dto.getSeverity())
                .riskScore(dto.getRiskScore())
                .windowMinutes(dto.getWindowMinutes() != null && dto.getWindowMinutes() > 0 ? dto.getWindowMinutes() : 5)
                .scheduleCron(dto.getScheduleCron())
                .enabled(true)
                .build();
        CorrelationRule saved = repository.save(rule);
        auditEventPublisher.publish("CORRELATION_RULE_CREATE", "correlation-rule/" + saved.getId(), "created");
        return saved;
    }

    @PutMapping("/rules/{id}")
    public CorrelationRule updateRule(@PathVariable String id, @RequestBody CorrelationRuleDto dto,
            @RequestHeader("X-Tenant-ID") String tenantId) {
        CorrelationRule rule = repository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Correlation rule not found"));
        rule.setName(dto.getName());
        rule.setDescription(dto.getDescription());
        rule.setSplQuery(dto.getSplQuery());
        rule.setSeverity(dto.getSeverity());
        rule.setRiskScore(dto.getRiskScore());
        if (dto.getWindowMinutes() != null && dto.getWindowMinutes() > 0) {
            rule.setWindowMinutes(dto.getWindowMinutes());
        }
        rule.setScheduleCron(dto.getScheduleCron());
        CorrelationRule saved = repository.save(rule);
        auditEventPublisher.publish("CORRELATION_RULE_UPDATE", "correlation-rule/" + id, "updated");
        return saved;
    }

    @PutMapping("/rules/{id}/toggle")
    public CorrelationRule toggleRule(@PathVariable String id, @RequestHeader("X-Tenant-ID") String tenantId) {
        CorrelationRule rule = repository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Correlation rule not found"));
        rule.setEnabled(!rule.isEnabled());
        CorrelationRule saved = repository.save(rule);
        auditEventPublisher.publish("CORRELATION_RULE_TOGGLE", "correlation-rule/" + id, "enabled=" + saved.isEnabled());
        return saved;
    }

    @DeleteMapping("/rules/{id}")
    public void deleteRule(@PathVariable String id, @RequestHeader("X-Tenant-ID") String tenantId) {
        CorrelationRule rule = repository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Correlation rule not found"));
        repository.delete(rule);
        auditEventPublisher.publish("CORRELATION_RULE_DELETE", "correlation-rule/" + id, "deleted");
    }

    @GetMapping("/stats")
    public java.util.Map<String, Object> getStats(@RequestHeader("X-Tenant-ID") String tenantId) {
        List<CorrelationRule> allRules = repository.findByTenantId(tenantId);
        long active = allRules.stream().filter(CorrelationRule::isEnabled).count();
        long disabled = allRules.stream().filter(r -> !r.isEnabled()).count();
        double avgRisk = allRules.stream().mapToInt(CorrelationRule::getRiskScore).average().orElse(0.0);

        Map<String, Long> matchCounts = correlationEngine.getRuleMatchCounts();
        List<Map<String, Object>> ruleActivity = allRules.stream()
                .map(rule -> {
                    Map<String, Object> entry = new java.util.HashMap<>();
                    entry.put("ruleId", rule.getId());
                    entry.put("name", rule.getName());
                    entry.put("enabled", rule.isEnabled());
                    entry.put("matchCount", matchCounts.getOrDefault(rule.getId(), 0L));
                    entry.put("lastRunAt", rule.getLastRunAt());
                    return entry;
                })
                .collect(Collectors.toList());

        java.util.Map<String, Object> stats = new java.util.HashMap<>();
        stats.put("activeRules", active);
        stats.put("disabledRules", disabled);
        stats.put("avgRiskScore", Math.round(avgRisk));
        stats.put("totalEvents", correlationEngine.getTotalEvents());
        stats.put("eventsSeries", correlationEngine.getBuckets());
        stats.put("ruleActivity", ruleActivity);

        return stats;
    }

    private CorrelationRuleDto mapToDto(CorrelationRule rule) {
        return CorrelationRuleDto.builder()
                .id(rule.getId())
                .tenantId(rule.getTenantId())
                .name(rule.getName())
                .description(rule.getDescription())
                .splQuery(rule.getSplQuery())
                .severity(rule.getSeverity())
                .riskScore(rule.getRiskScore())
                .enabled(rule.isEnabled())
                .scheduleCron(rule.getScheduleCron())
                .windowMinutes(rule.getWindowMinutes())
                .threshold(correlationEngine.extractThresholdPublic(rule.getSplQuery()))
                .lastRunAt(rule.getLastRunAt())
                .createdAt(rule.getCreatedAt())
                .build();
    }
}
