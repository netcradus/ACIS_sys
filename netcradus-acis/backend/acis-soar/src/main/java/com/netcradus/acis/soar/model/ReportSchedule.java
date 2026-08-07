package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Entity
@Table(name = "report_schedules")
public class ReportSchedule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // Not DB-NOT-NULL: with no migration framework in place (ddl-auto=update),
    // a hard NOT NULL would fail schema-update on any DB that already has
    // rows from before this column existed (confirmed live: this exact
    // failure crashed acis-soar's boot against a DB with pre-existing
    // report_schedules rows). Enforced as non-null in application code
    // instead — same pattern as Asset.tenantId.
    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "report_name")
    private String reportName;

    private String format; // PDF, PPTX, CSV

    private String frequency; // Weekly Mon 08:00, Monthly 1st, etc.

    @Column(name = "next_run")
    private OffsetDateTime nextRun;

    private String recipients; // e.g. "4 recipients"

    private String status = "Active"; // Active, Paused
}
