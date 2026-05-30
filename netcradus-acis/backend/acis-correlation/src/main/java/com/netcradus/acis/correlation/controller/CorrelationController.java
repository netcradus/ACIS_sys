package com.netcradus.acis.correlation.controller;

import com.netcradus.acis.common.dto.CorrelationRuleDto;
import com.netcradus.acis.correlation.model.CorrelationRule;
import com.netcradus.acis.correlation.repository.CorrelationRuleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/correlation")
@RequiredArgsConstructor
public class CorrelationController {

    private final CorrelationRuleRepository repository;

    @GetMapping("/rules")
    public List<CorrelationRuleDto> getRules(@RequestHeader(value = "X-Tenant-ID", defaultValue = "demo-tenant") String tenantId) {
        return repository.findByTenantId(tenantId).stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    @PostMapping("/rules")
    public CorrelationRule createRule(@RequestBody CorrelationRuleDto dto) {
        CorrelationRule rule = CorrelationRule.builder()
                .tenantId(dto.getTenantId())
                .name(dto.getName())
                .description(dto.getDescription())
                .splQuery(dto.getSplQuery())
                .severity(dto.getSeverity())
                .riskScore(dto.getRiskScore())
                .enabled(true)
                .build();
        return repository.save(rule);
    }

    @PutMapping("/rules/{id}/toggle")
    public CorrelationRule toggleRule(@PathVariable String id) {
        CorrelationRule rule = repository.findById(id).orElseThrow();
        rule.setEnabled(!rule.isEnabled());
        return repository.save(rule);
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
                .lastRunAt(rule.getLastRunAt())
                .createdAt(rule.getCreatedAt())
                .build();
    }
}
