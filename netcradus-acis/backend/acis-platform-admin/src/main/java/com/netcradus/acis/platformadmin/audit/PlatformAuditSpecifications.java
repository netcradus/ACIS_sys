package com.netcradus.acis.platformadmin.audit;

import org.springframework.data.jpa.domain.Specification;

import java.time.OffsetDateTime;

/** Per-filter Specification builders for PlatformAuditService.search()/searchForExport(). */
final class PlatformAuditSpecifications {

    private PlatformAuditSpecifications() {
    }

    static Specification<PlatformAuditEvent> startDate(OffsetDateTime startDate) {
        if (startDate == null) {
            return null;
        }
        return (root, query, cb) -> cb.greaterThanOrEqualTo(root.get("timestamp"), startDate);
    }

    static Specification<PlatformAuditEvent> endDate(OffsetDateTime endDate) {
        if (endDate == null) {
            return null;
        }
        return (root, query, cb) -> cb.lessThanOrEqualTo(root.get("timestamp"), endDate);
    }

    static Specification<PlatformAuditEvent> tenantId(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("tenantId"), tenantId);
    }

    static Specification<PlatformAuditEvent> adminUserId(String adminUserId) {
        if (adminUserId == null || adminUserId.isBlank()) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("adminUserId"), adminUserId);
    }

    static Specification<PlatformAuditEvent> targetUserId(String targetUserId) {
        if (targetUserId == null || targetUserId.isBlank()) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("targetUserId"), targetUserId);
    }

    static Specification<PlatformAuditEvent> action(AuditAction action) {
        if (action == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("action"), action);
    }

    static Specification<PlatformAuditEvent> status(AuditStatus status) {
        if (status == null) {
            return null;
        }
        return (root, query, cb) -> cb.equal(root.get("status"), status);
    }

    /** Free-text OR-search across the columns an operator would actually recognize a user/tenant by. */
    static Specification<PlatformAuditEvent> freeText(String search) {
        if (search == null || search.isBlank()) {
            return null;
        }
        String like = "%" + search.toLowerCase() + "%";
        return (root, query, cb) -> cb.or(
                cb.like(cb.lower(root.get("targetUsername")), like),
                cb.like(cb.lower(root.get("targetEmail")), like),
                cb.like(cb.lower(root.get("adminUsername")), like),
                cb.like(cb.lower(root.get("adminEmail")), like),
                cb.like(cb.lower(root.get("tenantName")), like),
                cb.like(cb.lower(root.get("failureReason")), like)
        );
    }
}
