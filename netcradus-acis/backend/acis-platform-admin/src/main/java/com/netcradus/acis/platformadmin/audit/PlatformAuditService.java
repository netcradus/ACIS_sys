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
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class PlatformAuditService {

    private static final String GENESIS_HASH = "0".repeat(64);

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
            attachChainHash(event);
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
            attachChainHash(event);
            repository.save(event);
        } catch (Exception e) {
            log.warn("Failed to persist audit failure event: {}", e.getMessage());
        }
    }

    /**
     * Real tamper-evidence, same single-instance tradeoff documented on
     * acis-soar's AuditEventConsumer: correct as long as writes happen from
     * one instance. This service's writes are request-thread-synchronous
     * (not a Kafka consumer), so within one instance they're naturally
     * serialized by whatever concurrency the servlet container itself uses -
     * no additional locking added here beyond that existing assumption.
     */
    private void attachChainHash(PlatformAuditEvent event) {
        String prevHash = repository.findTopByOrderByTimestampDesc()
                .map(PlatformAuditEvent::getHash)
                .orElse(GENESIS_HASH);
        event.setPrevHash(prevHash);
        event.setHash(computeHash(prevHash, event));
    }

    /** Same field concatenation the verify path recomputes - keep them in sync. */
    static String computeHash(String prevHash, PlatformAuditEvent event) {
        try {
            String payload = String.join("|",
                    prevHash,
                    String.valueOf(event.getAdminUserId()),
                    String.valueOf(event.getTargetUserId()),
                    String.valueOf(event.getTenantId()),
                    String.valueOf(event.getAction()),
                    String.valueOf(event.getResourceType()),
                    String.valueOf(event.getStatus()),
                    String.valueOf(event.getFailureReason()),
                    String.valueOf(event.getTimestamp()));
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(payload.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public record ChainVerificationResult(boolean valid, int checkedCount, String brokenAtEntryId, String detail) {}

    /** Real verification - recomputes every hash from actual row content rather than trusting a stored field. */
    public ChainVerificationResult verifyChain() {
        List<PlatformAuditEvent> entries = repository.findAllByOrderByTimestampAsc();
        String expectedPrevHash = GENESIS_HASH;
        int checked = 0;
        int legacySkipped = 0;
        for (PlatformAuditEvent entry : entries) {
            if (entry.getPrevHash() == null || entry.getHash() == null) {
                // Predates this feature - see ComplianceService.verifyAuditChain
                // for why this skips rather than stops the walk.
                legacySkipped++;
                continue;
            }
            if (!entry.getPrevHash().equals(expectedPrevHash)) {
                return new ChainVerificationResult(false, checked, entry.getId().toString(),
                        "prevHash does not match the preceding entry's real hash - the chain was broken before this entry.");
            }
            String recomputed = computeHash(entry.getPrevHash(), entry);
            if (!recomputed.equals(entry.getHash())) {
                return new ChainVerificationResult(false, checked, entry.getId().toString(),
                        "Stored hash does not match a hash recomputed from this entry's real content - it was altered after being written.");
            }
            expectedPrevHash = entry.getHash();
            checked++;
        }
        String detail = legacySkipped > 0
                ? "All " + checked + " entries verified intact (" + legacySkipped + " earlier entries predate tamper-evidence and are not covered)."
                : "All " + checked + " entries verified intact.";
        return new ChainVerificationResult(true, checked, null, detail);
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
