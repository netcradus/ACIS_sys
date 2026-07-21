package com.netcradus.acis.soar.service;

import com.netcradus.acis.common.audit.AuditEvent;
import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.soar.model.AuditEntry;
import com.netcradus.acis.soar.repository.AuditEntryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Central audit sink: every acis-* service that wants to record an audit
 * entry publishes an AuditEvent via AuditEventPublisher; this is the single
 * consumer that persists them into audit_entries (owned by acis-soar).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AuditEventConsumer {

    private final AuditEntryRepository auditEntryRepository;

    @KafkaListener(topics = AuditEventPublisher.TOPIC, groupId = "acis-soar-audit-group")
    public void consume(AuditEvent event) {
        if (event.tenantId() == null) {
            log.warn("Dropping audit event with no tenantId: action={} resource={}", event.action(), event.resource());
            return;
        }
        // Kafka listener thread has no HTTP request / TenantContextFilter, so
        // the tenant must be set explicitly here for the Row Level Security
        // policy on audit_entries to allow the insert.
        try {
            TenantContext.setTenantId(event.tenantId());
            AuditEntry entry = new AuditEntry();
            entry.setTenantId(UUID.fromString(event.tenantId()));
            entry.setUser(event.user());
            entry.setAction(event.action());
            entry.setResource(event.resource());
            entry.setIp(event.ip());
            entry.setStatus(event.status());
            entry.setTimestamp(event.timestamp());
            auditEntryRepository.save(entry);
        } catch (Exception e) {
            log.warn("Failed to persist audit event action={} resource={}: {}", event.action(), event.resource(), e.getMessage());
        } finally {
            TenantContext.clear();
        }
    }
}
