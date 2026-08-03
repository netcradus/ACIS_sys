package com.netcradus.acis.platformadmin.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.platformadmin.audit.AuditAction;
import com.netcradus.acis.platformadmin.audit.PlatformAuditService;
import com.netcradus.acis.platformadmin.model.Tenant;
import com.netcradus.acis.platformadmin.model.TenantModule;
import com.netcradus.acis.platformadmin.model.TenantStatus;
import com.netcradus.acis.platformadmin.repository.TenantRepository;
import com.netcradus.acis.platformadmin.service.PlatformUserService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * The one deliberately public, unauthenticated, state-mutating endpoint in
 * the whole backend (see SecurityConfig's explicit carve-out for this exact
 * path) — self-service "create a company account" signup. Provisions a
 * brand-new Tenant row AND its first Keycloak user (roles: admin +
 * company-admin) as one best-effort unit, rolling the tenant back if the
 * Keycloak side fails — there's no real cross-service transaction spanning
 * Postgres + Keycloak, so this mirrors PlatformUserService's own
 * create-then-roll-back-on-failure approach rather than leaving an orphaned,
 * ownerless tenant behind.
 *
 * Being unauthenticated, there is no caller identity to rate-limit by the
 * way acis-gateway's RateLimiterFilter normally does (it keys on the JWT's
 * tenant_id claim, which doesn't exist pre-signup) — a lightweight per-IP
 * sliding-window limiter is applied locally instead. This bounds
 * single-instance abuse only; it is NOT a substitute for CAPTCHA or
 * confirm-before-create email verification at real scale. No other public
 * mutating endpoint exists anywhere else in this codebase to model this on
 * — flagging that gap explicitly rather than pretending this is a fully
 * hardened pattern.
 */
@RestController
@RequestMapping("/api/platform/signup")
@RequiredArgsConstructor
public class TenantSignupController {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final int MIN_PASSWORD_LENGTH = 8;
    private static final int MAX_SIGNUPS_PER_IP_PER_HOUR = 5;

    private final TenantRepository tenantRepository;
    private final PlatformUserService platformUserService;
    private final PlatformAuditService auditService;

    private final Map<String, Deque<Instant>> signupAttemptsByIp = new ConcurrentHashMap<>();

    public record SignupRequest(String companyName, String adminName, String email, String password) {
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, String>>> signup(
            @RequestBody SignupRequest request, HttpServletRequest httpRequest) {

        enforceRateLimit(clientIp(httpRequest));
        validate(request);

        Tenant tenant = new Tenant();
        tenant.setId(UUID.randomUUID());
        tenant.setName(request.companyName().trim());
        tenant.setSlug(slugify(request.companyName()));
        tenant.setPlanName("Free Trial");
        tenant.setContactEmail(request.email().trim());
        tenant.setContactName(request.adminName().trim());
        tenant.setStatus(TenantStatus.ACTIVE);
        tenant.setEnabledModules(Set.of(TenantModule.values()));
        Tenant savedTenant = tenantRepository.save(tenant);

        String[] nameParts = splitName(request.adminName().trim());

        try {
            String userId = platformUserService.createUser(new PlatformUserService.CreateUserRequest(
                    savedTenant.getId().toString(),
                    request.email().trim(),
                    request.email().trim(),
                    nameParts[0],
                    nameParts[1],
                    request.password(),
                    false,
                    List.of("admin", "company-admin"),
                    true));

            auditService.record(AuditAction.TENANT_CREATED, "TENANT", null, null, null,
                    savedTenant.getId().toString(), savedTenant.getName(), null,
                    "Self-service signup (user " + userId + ")");

            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(ApiResponse.success(Map.of("tenantId", savedTenant.getId().toString())));
        } catch (RuntimeException e) {
            tenantRepository.delete(savedTenant);
            throw e;
        }
    }

    private void validate(SignupRequest request) {
        if (request.companyName() == null || request.companyName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Company name is required");
        }
        if (request.adminName() == null || request.adminName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your name is required");
        }
        if (request.email() == null || !EMAIL_PATTERN.matcher(request.email().trim()).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid email address is required");
        }
        if (request.password() == null || request.password().length() < MIN_PASSWORD_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Password must be at least " + MIN_PASSWORD_LENGTH + " characters");
        }
    }

    private void enforceRateLimit(String ip) {
        Instant now = Instant.now();
        Deque<Instant> attempts = signupAttemptsByIp.computeIfAbsent(ip, k -> new ArrayDeque<>());
        synchronized (attempts) {
            while (!attempts.isEmpty() && attempts.peekFirst().isBefore(now.minusSeconds(3600))) {
                attempts.pollFirst();
            }
            if (attempts.size() >= MAX_SIGNUPS_PER_IP_PER_HOUR) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Too many signup attempts from this network. Please try again later.");
            }
            attempts.addLast(now);
        }
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private static String slugify(String name) {
        String base = name.trim().toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        return base.isBlank() ? UUID.randomUUID().toString() : base;
    }

    private static String[] splitName(String fullName) {
        int spaceIndex = fullName.indexOf(' ');
        if (spaceIndex < 0) {
            return new String[] { fullName, "" };
        }
        return new String[] { fullName.substring(0, spaceIndex), fullName.substring(spaceIndex + 1).trim() };
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleDuplicateCompany(DataIntegrityViolationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiResponse.failure("ERR_DUPLICATE_COMPANY",
                "An account for this company name already exists. Please contact support or try a slightly different name."));
    }
}
