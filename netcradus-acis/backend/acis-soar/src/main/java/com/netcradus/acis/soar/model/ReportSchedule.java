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

    @Column(name = "report_name")
    private String reportName;

    private String format; // PDF, PPTX, CSV

    private String frequency; // Weekly Mon 08:00, Monthly 1st, etc.

    @Column(name = "next_run")
    private OffsetDateTime nextRun;

    private String recipients; // e.g. "4 recipients"

    private String status = "Active"; // Active, Paused
}
