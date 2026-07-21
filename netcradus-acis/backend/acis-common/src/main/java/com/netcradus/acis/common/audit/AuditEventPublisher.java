package com.netcradus.acis.common.audit;

import com.netcradus.acis.common.tenant.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;

/**
 * Publishes audit events for the current request's tenant/user (from
 * TenantContext, populated by TenantContextFilter). Register as a @Bean in
 * each service that should emit audit entries, then inject and call from
 * controllers/services around significant write actions.
 *
 * Deliberately fire-and-forget from the caller's point of view: a failure to
 * publish an audit event must never fail the business operation it's
 * auditing, so exceptions are logged, not propagated.
 */
public class AuditEventPublisher {

    public static final String TOPIC = "acis.audit.events";

    private static final Logger log = LoggerFactory.getLogger(AuditEventPublisher.class);

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public AuditEventPublisher(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void publish(String action, String resource, String status) {
        try {
            String tenantId = TenantContext.getTenantId();
            String user = TenantContext.getUserEmail();
            kafkaTemplate.send(TOPIC, AuditEvent.of(tenantId, user, action, resource, status, null));
        } catch (Exception e) {
            log.warn("Failed to publish audit event action={} resource={}: {}", action, resource, e.getMessage());
        }
    }
}
