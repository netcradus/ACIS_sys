package com.netcradus.acis.platformadmin.audit;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import java.time.OffsetDateTime;
import java.util.ArrayList;
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
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "timestamp"));
        return repository.findAll(buildSpecification(startDate, endDate, tenantId, adminUserId, targetUserId,
                action, status, search), pageable);
    }

    public List<PlatformAuditEvent> searchForExport(OffsetDateTime startDate, OffsetDateTime endDate,
                                                    String tenantId, String adminUserId, String targetUserId,
                                                    AuditAction action, AuditStatus status, String search) {
        return repository.findAll(buildSpecification(startDate, endDate, tenantId, adminUserId, targetUserId,
                action, status, search), Sort.by(Sort.Direction.DESC, "timestamp"));
    }

    private Specification<PlatformAuditEvent> buildSpecification(OffsetDateTime startDate, OffsetDateTime endDate,
                                                                  String tenantId, String adminUserId, String targetUserId,
                                                                  AuditAction action, AuditStatus status, String search) {
        List<Specification<PlatformAuditEvent>> specs = new ArrayList<>();
        addIfPresent(specs, PlatformAuditSpecifications.startDate(startDate));
        addIfPresent(specs, PlatformAuditSpecifications.endDate(endDate));
        addIfPresent(specs, PlatformAuditSpecifications.tenantId(tenantId));
        addIfPresent(specs, PlatformAuditSpecifications.adminUserId(adminUserId));
        addIfPresent(specs, PlatformAuditSpecifications.targetUserId(targetUserId));
        addIfPresent(specs, PlatformAuditSpecifications.action(action));
        addIfPresent(specs, PlatformAuditSpecifications.status(status));
        addIfPresent(specs, PlatformAuditSpecifications.freeText(search));
        return Specification.allOf(specs);
    }

    private static void addIfPresent(List<Specification<PlatformAuditEvent>> specs, Specification<PlatformAuditEvent> spec) {
        if (spec != null) {
            specs.add(spec);
        }
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
            event.setAdminUsername(resolveAdminUsername(jwt));
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

    /**
     * Resolves a human-readable admin identity from the JWT. preferred_username
     * is the primary source (populated by the "email" client scope's
     * username-mapper — see realm-acis.json/apply-audit-username-mapper.sh);
     * email is a real, already-present fallback for any token minted before
     * that mapper was deployed or by a client that never picks up the scope.
     * The raw subject UUID is the last resort — never fabricated, always an
     * actual, already-present JWT value. Historical audit rows written before
     * this fix keep whatever was resolved at the time (immutable, write-once)
     * and are unaffected by this method.
     */
    static String resolveAdminUsername(Jwt jwt) {
        String preferredUsername = jwt.getClaimAsString("preferred_username");
        if (preferredUsername != null && !preferredUsername.isBlank()) {
            return preferredUsername;
        }
        String email = jwt.getClaimAsString("email");
        if (email != null && !email.isBlank()) {
            return email;
        }
        return jwt.getSubject();
    }
}
