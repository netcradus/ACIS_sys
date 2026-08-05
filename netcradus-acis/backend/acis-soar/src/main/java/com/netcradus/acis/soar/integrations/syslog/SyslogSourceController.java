package com.netcradus.acis.soar.integrations.syslog;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.common.syslog.SyslogSource;
import com.netcradus.acis.common.syslog.SyslogSourceRepository;
import com.netcradus.acis.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Allocates a real, dedicated UDP/TCP port per tenant for raw syslog/CEF
 * ingestion (see SyslogListenerService in acis-ingestion, which actually
 * binds these ports). Raw syslog has no authentication of any kind, so
 * port assignment IS the tenancy mechanism here — see SyslogSource's
 * Javadoc for why.
 */
@RestController
@RequestMapping("/api/soar/settings/syslog")
@RequiredArgsConstructor
public class SyslogSourceController {

    private final SyslogSourceRepository repository;
    private final AuditEventPublisher auditEventPublisher;

    @Value("${acis.syslog.port-range-start:20514}")
    private int portRangeStart;

    @Value("${acis.syslog.port-range-end:20563}")
    private int portRangeEnd;

    private UUID resolveTenant(UUID tenantId) {
        if (tenantId == null) {
            throw new IllegalStateException("X-Tenant-ID missing; request should have been rejected upstream");
        }
        return tenantId;
    }

    @GetMapping
    public ApiResponse<Map<String, Object>> getConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        Optional<SyslogSource> existing = repository.findByTenantId(resolveTenant(tenantId));
        Map<String, Object> body = new java.util.HashMap<>();
        if (existing.isPresent()) {
            SyslogSource s = existing.get();
            body.put("configured", true);
            body.put("port", s.getAssignedPort());
            body.put("enabled", s.isEnabled());
            body.put("lastReceivedAt", s.getLastReceivedAt() != null ? s.getLastReceivedAt().toString() : null);
        } else {
            body.put("configured", false);
        }
        return ApiResponse.success(body);
    }

    /**
     * Allocates a real port from the configured range. Cross-tenant read is
     * required to avoid handing out a port another tenant already has — see
     * TenantContext.setSystemPollerInProgress and the matching RLS policy.
     */
    @PostMapping
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> createSource(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        if (repository.findByTenantId(tid).isPresent()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("A syslog source is already configured for this tenant"));
        }

        Set<Integer> usedPorts = new HashSet<>();
        TenantContext.setSystemPollerInProgress(true);
        try {
            repository.findAll().forEach(s -> usedPorts.add(s.getAssignedPort()));
        } finally {
            TenantContext.setSystemPollerInProgress(false);
        }

        Integer freePort = null;
        for (int port = portRangeStart; port <= portRangeEnd; port++) {
            if (!usedPorts.contains(port)) {
                freePort = port;
                break;
            }
        }
        if (freePort == null) {
            return ResponseEntity.status(409).body(ApiResponse.error(
                    "No free syslog ports available (range " + portRangeStart + "-" + portRangeEnd + " is fully allocated)"));
        }

        SyslogSource source = new SyslogSource();
        source.setTenantId(tid);
        source.setAssignedPort(freePort);
        source.setEnabled(true);
        repository.save(source);

        auditEventPublisher.publish("SYSLOG_SOURCE_CREATE", "syslog-source/" + tid, "allocated port " + freePort);
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("configured", true);
        body.put("port", freePort);
        body.put("enabled", true);
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @PutMapping("/{id}/toggle")
    public ResponseEntity<ApiResponse<Map<String, Object>>> toggle(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        return repository.findByTenantId(tid)
                .filter(s -> s.getId().equals(id))
                .map(s -> {
                    s.setEnabled(!s.isEnabled());
                    repository.save(s);
                    auditEventPublisher.publish("SYSLOG_SOURCE_TOGGLE", "syslog-source/" + tid, "enabled=" + s.isEnabled());
                    Map<String, Object> body = new java.util.HashMap<>();
                    body.put("configured", true);
                    body.put("port", s.getAssignedPort());
                    body.put("enabled", s.isEnabled());
                    return ResponseEntity.ok(ApiResponse.success(body));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Syslog source not found")));
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<ApiResponse<String>> deleteSource(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        repository.deleteByTenantId(tid);
        auditEventPublisher.publish("SYSLOG_SOURCE_DELETE", "syslog-source/" + tid, "removed — port released");
        return ResponseEntity.ok(ApiResponse.success("Syslog source removed"));
    }
}
