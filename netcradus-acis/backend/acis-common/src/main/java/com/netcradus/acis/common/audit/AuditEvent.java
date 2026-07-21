package com.netcradus.acis.common.audit;

import java.time.Instant;

/**
 * Wire-format payload for the acis.audit.events Kafka topic. Published by any
 * service on a significant write action (rule change, playbook execution,
 * endpoint isolation, etc.) and consumed once, centrally, by acis-soar, which
 * owns the audit_entries table.
 */
public record AuditEvent(
        String tenantId,
        String user,
        String action,
        String resource,
        String status,
        String ip,
        String timestamp
) {
    public static AuditEvent of(String tenantId, String user, String action, String resource, String status, String ip) {
        return new AuditEvent(tenantId, user, action, resource, status, ip, Instant.now().toString());
    }
}
