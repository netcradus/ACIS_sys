package com.netcradus.acis.platformadmin.audit;

import com.netcradus.acis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * REST controller for the Platform Audit Log. Provides paginated search,
 * detail view, and CSV/Excel export. All endpoints gated by the blanket
 * PLATFORM_ADMIN role in SecurityConfig.
 */
@RestController
@RequestMapping("/api/platform/audit")
@RequiredArgsConstructor
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

    private static String escapeCsv(String value) {
        if (value == null) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
