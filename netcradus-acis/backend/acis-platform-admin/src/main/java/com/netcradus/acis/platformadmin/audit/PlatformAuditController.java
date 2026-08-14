package com.netcradus.acis.platformadmin.audit;

import com.netcradus.acis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.io.ByteArrayOutputStream;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * REST controller for the Platform Audit Log. Provides paginated search,
 * detail view, and CSV/Excel export. All endpoints gated by the blanket
 * PLATFORM_ADMIN role in SecurityConfig; the class-level @PreAuthorize is
 * defense-in-depth on top of that rule.
 */
@RestController
@RequestMapping("/api/platform/audit")
@RequiredArgsConstructor
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class PlatformAuditController {

    private final PlatformAuditService auditService;

    @GetMapping
    public ApiResponse<Map<String, Object>> search(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime endDate,
            @RequestParam(required = false) String tenantId,
            @RequestParam(required = false) String adminUserId,
            @RequestParam(required = false) String targetUserId,
            @RequestParam(required = false) AuditAction action,
            @RequestParam(required = false) AuditStatus status,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        if (size > 200) size = 200;

        Page<PlatformAuditEvent> result = auditService.search(
                startDate, endDate, tenantId, adminUserId, targetUserId,
                action, status, search, page, size);

        Map<String, Object> response = Map.of(
                "content", result.getContent(),
                "totalElements", result.getTotalElements(),
                "totalPages", result.getTotalPages(),
                "page", result.getNumber(),
                "size", result.getSize()
        );

        return ApiResponse.success(response);
    }

    @GetMapping("/actions")
    public ApiResponse<AuditAction[]> listActions() {
        return ApiResponse.success(AuditAction.values());
    }

    /** Real tamper-evidence check - recomputes the actual hash chain rather than trusting a stored status flag. See PlatformAuditService.verifyChain. */
    @GetMapping("/verify")
    public ApiResponse<PlatformAuditService.ChainVerificationResult> verify() {
        return ApiResponse.success(auditService.verifyChain());
    }

    @GetMapping("/export/csv")
    public ResponseEntity<byte[]> exportCsv(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime endDate,
            @RequestParam(required = false) String tenantId,
            @RequestParam(required = false) String adminUserId,
            @RequestParam(required = false) String targetUserId,
            @RequestParam(required = false) AuditAction action,
            @RequestParam(required = false) AuditStatus status,
            @RequestParam(required = false) String search) {

        List<PlatformAuditEvent> events = auditService.searchForExport(
                startDate, endDate, tenantId, adminUserId, targetUserId, action, status, search);

        StringBuilder csv = new StringBuilder();
        csv.append("Timestamp,Admin User,Admin Email,Action,Target User,Target Email,Tenant,Previous Value,New Value,Status,Failure Reason,IP Address,User Agent\n");

        for (PlatformAuditEvent e : events) {
            csv.append(escapeCsv(e.getTimestamp() != null ? e.getTimestamp().toString() : "")).append(",");
            csv.append(escapeCsv(e.getAdminUsername())).append(",");
            csv.append(escapeCsv(e.getAdminEmail())).append(",");
            csv.append(escapeCsv(e.getAction() != null ? e.getAction().name() : "")).append(",");
            csv.append(escapeCsv(e.getTargetUsername())).append(",");
            csv.append(escapeCsv(e.getTargetEmail())).append(",");
            csv.append(escapeCsv(e.getTenantName())).append(",");
            csv.append(escapeCsv(e.getPreviousValue())).append(",");
            csv.append(escapeCsv(e.getNewValue())).append(",");
            csv.append(escapeCsv(e.getStatus() != null ? e.getStatus().name() : "")).append(",");
            csv.append(escapeCsv(e.getFailureReason())).append(",");
            csv.append(escapeCsv(e.getIpAddress())).append(",");
            csv.append(escapeCsv(e.getUserAgent())).append("\n");
        }

        byte[] bytes = csv.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=platform-audit-log.csv")
                .contentType(MediaType.parseMediaType("text/csv"))
                .contentLength(bytes.length)
                .body(bytes);
    }

    @GetMapping("/export/xlsx")
    public ResponseEntity<byte[]> exportXlsx(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime endDate,
            @RequestParam(required = false) String tenantId,
            @RequestParam(required = false) String adminUserId,
            @RequestParam(required = false) String targetUserId,
            @RequestParam(required = false) AuditAction action,
            @RequestParam(required = false) AuditStatus status,
            @RequestParam(required = false) String search) throws java.io.IOException {

        List<PlatformAuditEvent> events = auditService.searchForExport(
                startDate, endDate, tenantId, adminUserId, targetUserId, action, status, search);

        String[] headers = {"Timestamp", "Admin User", "Admin Email", "Action", "Target User", "Target Email",
                "Tenant", "Previous Value", "New Value", "Status", "Failure Reason", "IP Address", "User Agent"};

        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Audit Log");

            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerStyle.setFont(headerFont);

            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            int rowIdx = 1;
            for (PlatformAuditEvent e : events) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(e.getTimestamp() != null ? e.getTimestamp().toString() : "");
                row.createCell(1).setCellValue(nullToEmpty(e.getAdminUsername()));
                row.createCell(2).setCellValue(nullToEmpty(e.getAdminEmail()));
                row.createCell(3).setCellValue(e.getAction() != null ? e.getAction().name() : "");
                row.createCell(4).setCellValue(nullToEmpty(e.getTargetUsername()));
                row.createCell(5).setCellValue(nullToEmpty(e.getTargetEmail()));
                row.createCell(6).setCellValue(nullToEmpty(e.getTenantName()));
                row.createCell(7).setCellValue(nullToEmpty(e.getPreviousValue()));
                row.createCell(8).setCellValue(nullToEmpty(e.getNewValue()));
                row.createCell(9).setCellValue(e.getStatus() != null ? e.getStatus().name() : "");
                row.createCell(10).setCellValue(nullToEmpty(e.getFailureReason()));
                row.createCell(11).setCellValue(nullToEmpty(e.getIpAddress()));
                row.createCell(12).setCellValue(nullToEmpty(e.getUserAgent()));
            }

            for (int i = 0; i < headers.length; i++) {
                sheet.autoSizeColumn(i);
            }

            workbook.write(out);
            byte[] bytes = out.toByteArray();

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=platform-audit-log.xlsx")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .contentLength(bytes.length)
                    .body(bytes);
        }
    }

    private static String nullToEmpty(String value) {
        return value != null ? value : "";
    }

    private static String escapeCsv(String value) {
        if (value == null) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
