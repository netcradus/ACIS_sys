package com.netcradus.acis.alerts.controller;

import com.netcradus.acis.alerts.model.Alert;
import com.netcradus.acis.alerts.repository.AlertRepository;
import com.netcradus.acis.alerts.service.AlertService;
import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.AlertDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@RestController
@RequestMapping("/api/alerts")
@RequiredArgsConstructor
public class AlertController {

    private final AlertService alertService;
    private final AlertRepository alertRepository;
    private final AuditEventPublisher auditEventPublisher;

    @Value("${acis.ai-service.url}")
    private String aiServiceUrl;

    @GetMapping
    public List<AlertDto> getAllAlerts(@RequestHeader("X-Tenant-ID") String tenantId) {
        return alertService.findAll(tenantId);
    }

    @GetMapping("/{id}")
    public Alert getAlertById(@PathVariable String id, @RequestHeader("X-Tenant-ID") String tenantId) {
        return alertRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Alert not found"));
    }

    @PutMapping("/{id}/status")
    public Alert updateStatus(@PathVariable String id, @RequestParam String status,
                               @RequestHeader("X-Tenant-ID") String tenantId) {
        Alert alert = alertRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Alert not found"));
        alert.setStatus(status);
        Alert saved = alertRepository.save(alert);
        auditEventPublisher.publish("ALERT_STATUS_CHANGE", "alert/" + id, "status=" + status);
        return saved;
    }

    @PutMapping("/{id}")
    public Alert updateAlert(@PathVariable String id, @RequestBody Map<String, Object> updates,
                              @RequestHeader("X-Tenant-ID") String tenantId) {
        Alert alert = alertRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Alert not found"));
        if (updates.containsKey("status")) {
            alert.setStatus((String) updates.get("status"));
        }
        if (updates.containsKey("ownerId")) {
            alert.setOwnerId((String) updates.get("ownerId"));
        }
        Alert saved = alertRepository.save(alert);
        auditEventPublisher.publish("ALERT_UPDATE", "alert/" + id, "updated");
        return saved;
    }

    @GetMapping("/dashboard/summary")
    public Map<String, Object> getDashboardSummary(@RequestHeader("X-Tenant-ID") String tenantId) {
        Map<String, Object> summary = new HashMap<>();
        List<Alert> allAlerts = alertRepository.findAllByTenantId(tenantId);

        long critical = allAlerts.stream().filter(a -> "CRITICAL".equalsIgnoreCase(a.getSeverity())).count();
        long high = allAlerts.stream().filter(a -> "HIGH".equalsIgnoreCase(a.getSeverity())).count();
        long open = allAlerts.stream().filter(a -> "OPEN".equalsIgnoreCase(a.getStatus())).count();

        summary.put("totalAlerts", allAlerts.size());
        summary.put("criticalAlerts", critical);
        summary.put("highAlerts", high);
        summary.put("openIncidents", open);
        summary.put("events24h", null); // Set to null to indicate "Still in development" in frontend
        
        return summary;
    }

    private final RestTemplate restTemplate = new RestTemplate();

    @PostMapping("/{id}/explain")
    public ResponseEntity<Map> explainAlert(@PathVariable String id, @RequestBody Map<String, Object> payload) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);
        
        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(aiServiceUrl + "/ai/explain", request, Map.class);
            return ResponseEntity.status(response.getStatusCode())
                                 .headers(response.getHeaders())
                                 .body(response.getBody());
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
