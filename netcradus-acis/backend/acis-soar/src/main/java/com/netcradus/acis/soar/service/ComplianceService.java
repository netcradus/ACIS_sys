package com.netcradus.acis.soar.service;

import com.netcradus.acis.soar.model.AuditEntry;
import com.netcradus.acis.soar.repository.AuditEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ComplianceService {

    private final AuditEntryRepository auditEntryRepository;

    public List<ComplianceFramework> getFrameworks(UUID tenantId) {
        return List.of(
            new ComplianceFramework(
                "NIS2",
                "Network & Information Security Directive",
                92,
                "text-success",
                "bg-success",
                List.of(
                    new ComplianceControl("Risk Management Measures", "18/18", "Compliant"),
                    new ComplianceControl("Incident Handling", "12/12", "Compliant"),
                    new ComplianceControl("Reporting Obligations", "8/9", "In Progress"),
                    new ComplianceControl("Business Continuity", "6/6", "Compliant"),
                    new ComplianceControl("Supply Chain Security", "4/4", "Compliant")
                )
            ),
            new ComplianceFramework(
                "GDPR",
                "General Data Protection Regulation",
                88,
                "text-warning",
                "bg-warning",
                List.of(
                    new ComplianceControl("Data Minimisation", "14/14", "Compliant"),
                    new ComplianceControl("Consent Management", "8/8", "Compliant"),
                    new ComplianceControl("Right to Erasure", "6/7", "In Progress"),
                    new ComplianceControl("Data Breach Notification", "5/5", "Compliant"),
                    new ComplianceControl("Privacy by Design", "3/4", "In Progress")
                )
            ),
            new ComplianceFramework(
                "ISO 27001",
                "Information Security Management",
                74,
                "text-accent",
                "bg-accent",
                List.of(
                    new ComplianceControl("Access Control", "22/22", "Compliant"),
                    new ComplianceControl("Asset Management", "15/18", "In Progress"),
                    new ComplianceControl("Cryptography Policy", "4/8", "Needs Attention"),
                    new ComplianceControl("Physical Security", "12/12", "Compliant"),
                    new ComplianceControl("Supplier Relations", "6/9", "In Progress")
                )
            )
        );
    }

    public List<AuditEntry> getAuditTrail(UUID tenantId) {
        if (tenantId == null) {
            return auditEntryRepository.findAllByOrderByTimestampDesc();
        }
        return auditEntryRepository.findByTenantIdOrderByTimestampDesc(tenantId);
    }

    public static final class ComplianceFramework {
        private final String name;
        private final String description;
        private final int percentage;
        private final String color;
        private final String barColor;
        private final List<ComplianceControl> controls;

        public ComplianceFramework(String name, String description, int percentage, String color, String barColor, List<ComplianceControl> controls) {
            this.name = name;
            this.description = description;
            this.percentage = percentage;
            this.color = color;
            this.barColor = barColor;
            this.controls = controls;
        }

        public String getName() { return name; }
        public String getDescription() { return description; }
        public int getPercentage() { return percentage; }
        public String getColor() { return color; }
        public String getBarColor() { return barColor; }
        public List<ComplianceControl> getControls() { return controls; }
    }

    public static final class ComplianceControl {
        private final String name;
        private final String count;
        private final String status;

        public ComplianceControl(String name, String count, String status) {
            this.name = name;
            this.count = count;
            this.status = status;
        }

        public String getName() { return name; }
        public String getCount() { return count; }
        public String getStatus() { return status; }
    }
}
