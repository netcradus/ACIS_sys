package com.netcradus.acis.log.model;

import jakarta.persistence.*;
import lombok.Data;

import java.util.UUID;

/**
 * Real, tenant-configurable mapping from an actual log document's `service`
 * field (whatever a real log shipper/ingestion source sends - see
 * IngestionController/SplunkHecController/SyslogListenerService) to one of
 * the three categories the Dashboard's "AI Powered SIEM" panel shows real
 * counts for. No default/guessed mapping is baked in here - a service with
 * no row in this table is genuinely "Uncategorized" until an admin maps it.
 */
@Entity
@Table(name = "log_category_mappings",
        uniqueConstraints = @UniqueConstraint(columnNames = {"tenant_id", "service_name"}))
@Data
public class LogCategoryMapping {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "service_name", nullable = false)
    private String serviceName;

    /** ENDPOINT, NETWORK, or APPLICATION. */
    @Column(nullable = false)
    private String category;
}
