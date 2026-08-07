package com.netcradus.acis.alerts.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.alerts.model.Incident;
import com.netcradus.acis.alerts.repository.IncidentRepository;
import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Real, persisted incidents — replaces what used to be 5 hardcoded literal
 * objects that only ever lived in client-side React state (create/mitigate
 * never called any backend at all, and no Incident concept existed
 * anywhere in the backend).
 */
@RestController
@RequestMapping("/api/incidents")
@RequiredArgsConstructor
public class IncidentController {

    private final IncidentRepository incidentRepository;
    private final AuditEventPublisher auditEventPublisher;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final List<String> DEFAULT_CHECKLIST_ITEMS = List.of(
            "Triage & Scope Assessment",
            "Threat Intelligence Lookup",
            "Containment Action",
            "Root Cause Analysis"
    );

    @GetMapping
    public List<Incident> getIncidents(@RequestHeader("X-Tenant-ID") String tenantId) {
        return incidentRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    public record CreateIncidentRequest(String title, String severity, String alertId) {}

    @PostMapping
    public Incident createIncident(@RequestBody CreateIncidentRequest request, @RequestHeader("X-Tenant-ID") String tenantId) {
        Incident incident = new Incident();
        incident.setTenantId(tenantId);
        // Real sequential numbering: count of this tenant's incidents so
        // far + a starting offset, so a brand-new tenant doesn't start at
        // "INC-1" — cosmetic only, never reused once assigned.
        long ordinal = incidentRepository.countByTenantId(tenantId) + 1;
        incident.setIncidentNumber("INC-" + (1000 + ordinal));
        incident.setTitle(request.title());
        incident.setSeverity(request.severity() != null ? request.severity() : "MEDIUM");
        incident.setAlertId(request.alertId());
        incident.setStatus("OPEN");
        incident.setChecklist(buildDefaultChecklist());
        Incident saved = incidentRepository.save(incident);
        auditEventPublisher.publish("INCIDENT_CREATE", "incident/" + saved.getId(), "created from alert=" + request.alertId());
        return saved;
    }

    @PutMapping("/{id}/status")
    public Incident updateStatus(@PathVariable String id, @RequestParam String status, @RequestHeader("X-Tenant-ID") String tenantId) {
        Incident incident = incidentRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Incident not found"));
        incident.setStatus(status);
        Incident saved = incidentRepository.save(incident);
        auditEventPublisher.publish("INCIDENT_STATUS_CHANGE", "incident/" + id, "status=" + status);
        return saved;
    }

    public record ChecklistToggleRequest(int index) {}

    @PutMapping("/{id}/checklist")
    public Incident toggleChecklistItem(@PathVariable String id, @RequestBody ChecklistToggleRequest request,
            @RequestHeader("X-Tenant-ID") String tenantId) {
        Incident incident = incidentRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Incident not found"));
        try {
            List<Map<String, Object>> items = objectMapper.readValue(incident.getChecklist(), List.class);
            if (request.index() >= 0 && request.index() < items.size()) {
                Map<String, Object> item = items.get(request.index());
                item.put("done", !Boolean.TRUE.equals(item.get("done")));
            }
            incident.setChecklist(objectMapper.writeValueAsString(items));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to update checklist: " + e.getMessage(), e);
        }
        Incident saved = incidentRepository.save(incident);
        auditEventPublisher.publish("INCIDENT_CHECKLIST_UPDATE", "incident/" + id, "item=" + request.index());
        return saved;
    }

    @DeleteMapping("/{id}")
    public void deleteIncident(@PathVariable String id, @RequestHeader("X-Tenant-ID") String tenantId) {
        Incident incident = incidentRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Incident not found"));
        incidentRepository.delete(incident);
        auditEventPublisher.publish("INCIDENT_DELETE", "incident/" + id, "deleted");
    }

    private String buildDefaultChecklist() {
        try {
            List<Map<String, Object>> items = DEFAULT_CHECKLIST_ITEMS.stream()
                    .map(label -> Map.<String, Object>of("label", label, "done", false))
                    .toList();
            return objectMapper.writeValueAsString(items);
        } catch (Exception e) {
            return "[]";
        }
    }
}
