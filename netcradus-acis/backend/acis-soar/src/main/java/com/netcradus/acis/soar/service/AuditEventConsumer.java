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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

/**
 * Central audit sink: every acis-* service that wants to record an audit
 * entry publishes an AuditEvent via AuditEventPublisher; this is the single
 * consumer that persists them into audit_entries (owned by acis-soar).
 *
 * Also computes this entry's real hash-chain link (see AuditEntry.hash /
 * prevHash) - single-instance/single-partition-consumer only, same
 * documented tradeoff as the gateway's rate limiter: correctness here
 * depends on this consumer processing events for a given tenant strictly in
 * order, which holds for one instance but would need a proper serialization
 * point (e.g. a per-tenant DB lock) if this service is ever horizontally
 * scaled with concurrency > 1.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AuditEventConsumer {

    private static final String GENESIS_HASH = "0".repeat(64);

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
            UUID tenantId = UUID.fromString(event.tenantId());

            AuditEntry entry = new AuditEntry();
            entry.setTenantId(tenantId);
            entry.setUser(event.user());
            entry.setAction(event.action());
            entry.setResource(event.resource());
            entry.setIp(event.ip());
            entry.setStatus(event.status());
            entry.setTimestamp(event.timestamp());

            String prevHash = auditEntryRepository.findTopByTenantIdOrderByTimestampDesc(tenantId)
                    .map(AuditEntry::getHash)
                    .orElse(GENESIS_HASH);
            entry.setPrevHash(prevHash);
            entry.setHash(computeHash(prevHash, entry));

            auditEntryRepository.save(entry);
        } catch (Exception e) {
            log.warn("Failed to persist audit event action={} resource={}: {}", event.action(), event.resource(), e.getMessage());
        } finally {
            TenantContext.clear();
        }
    }

    /** Same field concatenation ComplianceController's verify endpoint recomputes - keep them in sync. */
    static String computeHash(String prevHash, AuditEntry entry) {
        try {
            String payload = String.join("|",
                    prevHash,
                    String.valueOf(entry.getTenantId()),
                    String.valueOf(entry.getTimestamp()),
                    String.valueOf(entry.getUser()),
                    String.valueOf(entry.getAction()),
                    String.valueOf(entry.getResource()),
                    String.valueOf(entry.getIp()),
                    String.valueOf(entry.getStatus()));
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(payload.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
