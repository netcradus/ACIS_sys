package com.netcradus.acis.platformadmin.audit;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class PlatformAuditService {

    private final PlatformAuditRepository repository;

    public void record(AuditAction action, String resourceType,
                       String targetUserId, String targetUsername, String targetEmail,
                       String tenantId, String tenantName,
                       String previousValue, String newValue) {
        try {
            PlatformAuditEvent event = buildEvent(action, resourceType,
                    targetUserId, targetUsername, targetEmail,
                    tenantId, tenantName, previousValue, newValue,
                    AuditStatus.SUCCESS, null);
            repository.save(event);
        } catch (Exception e) {
            log.warn("Failed to persist audit event action={}: {}", action, e.getMessage());
        }
    }

    public void recordFailure(AuditAction action, String resourceType,
                              String targetUserId, String targetUsername, String targetEmail,
                              String tenantId, String tenantName, String failureReason) {
        try {
            PlatformAuditEvent event = buildEvent(action, resourceType,
                    targetUserId, targetUsername, targetEmail,
                    tenantId, tenantName, null, null,
                    AuditStatus.FAILURE, failureReason);
            repository.save(event);
        } catch (Exception e) {
            log.warn("Failed to persist audit failure event: {}", e.getMessage());
        }
    }

    public Page<PlatformAuditEvent> search(OffsetDateTime startDate, OffsetDateTime endDate,
                                           String tenantId, String adminUserId, String targetUserId,
                                           AuditAction action, AuditStatus status,
                                           String search, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        return repository.search(startDate, endDate, tenantId, adminUserId,
                targetUserId, action, status, search, pageable);
    }

    public List<PlatformAuditEvent> searchForExport(OffsetDateTime startDate, OffsetDateTime endDate,
                                                    String tenantId, String adminUserId, String targetUserId,
                                                    AuditAction action, AuditStatus status, String search) {
        return repository.searchForExport(startDate, endDate, tenantId, adminUserId,
                targetUserId, action, status, search);
    }

    private PlatformAuditEvent buildEvent(AuditAction action, String resourceType,
                                          String targetUserId, String targetUsername, String targetEmail,
                                          String tenantId, String tenantName,
                                          String previousValue, String newValue,
                                          AuditStatus status, String failureReason) {
        PlatformAuditEvent event = new PlatformAuditEvent();
        event.setId(UUID.randomUUID());
        event.setTimestamp(OffsetDateTime.now());
        event.setAction(action);
        event.setResourceType(resourceType);
        event.setTargetUserId(targetUserId);
        event.setTargetUsername(targetUsername);
        event.setTargetEmail(targetEmail);
        event.setTenantId(tenantId);
        event.setTenantName(tenantName);
        event.setPreviousValue(previousValue);
        event.setNewValue(newValue);
        event.setStatus(status);
        event.setFailureReason(failureReason);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            Jwt jwt = jwtAuth.getToken();
            event.setAdminUserId(jwt.getSubject());
            event.setAdminUsername(jwt.getClaimAsString("preferred_username"));
            event.setAdminEmail(jwt.getClaimAsString("email"));
        } else {
            event.setAdminUserId("SYSTEM");
            event.setAdminUsername("SYSTEM");
        }

        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs != null) {
                HttpServletRequest request = attrs.getRequest();
                String xff = request.getHeader("X-Forwarded-For");
                event.setIpAddress(xff != null ? xff.split(",")[0].trim() : request.getRemoteAddr());
                String ua = request.getHeader("User-Agent");
                event.setUserAgent(ua != null && ua.length() > 512 ? ua.substring(0, 512) : ua);
            }
        } catch (Exception e) {
            log.debug("Could not extract request metadata: {}", e.getMessage());
        }
        return event;
    }
}
