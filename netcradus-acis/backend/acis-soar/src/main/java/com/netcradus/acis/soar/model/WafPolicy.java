package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Per-tenant WAF configuration read by acis-gateway's WafInspectionFilter.
 * Absence of a row for a tenant means "use the default policy" (BLOCK, no
 * disabled categories) — see WafPolicyService.defaultPolicy — so a fresh
 * tenant is protected without needing an explicit row created for them.
 */
@Data
@Entity
@Table(name = "waf_policies")
public class WafPolicy {

    @Id
    @Column(name = "tenant_id")
    private UUID tenantId;

    /** BLOCK (reject matching requests) or MONITOR (allow through, alert only) — real false-positive escape hatch. */
    @Column(nullable = false)
    private String mode = "BLOCK";

    /** JSON array of category names (SQLI/XSS/CMDI/PATH_TRAVERSAL/RCE) this tenant has disabled, e.g. after a false positive. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "disabled_categories", columnDefinition = "jsonb")
    private String disabledCategories = "[]";

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void touch() {
        updatedAt = OffsetDateTime.now();
    }
}
