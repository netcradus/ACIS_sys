package com.netcradus.acis.platformadmin.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.platformadmin.audit.AuditAction;
import com.netcradus.acis.platformadmin.audit.PlatformAuditService;
import com.netcradus.acis.platformadmin.model.Tenant;
import com.netcradus.acis.platformadmin.model.TenantModule;
import com.netcradus.acis.platformadmin.model.TenantStatus;
import com.netcradus.acis.platformadmin.repository.TenantRepository;
import com.netcradus.acis.platformadmin.service.PlatformUserService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Every endpoint here explicitly names its target tenant via a path
 * variable and resolves it against the tenants table — never via
 * TenantContext, which is intentionally left empty for platform-admin
 * callers (see TenantContextFilter's carve-out). The class-level
 * @PreAuthorize is defense-in-depth on top of SecurityConfig's blanket rule.
 *
 * Every mutating endpoint records a PlatformAuditEvent — tenant suspend/
 * delete/plan/module changes are at least as consequential as the
 * user-management actions PlatformUserService already audits.
 */
@RestController
@RequestMapping("/api/platform/tenants")
@RequiredArgsConstructor
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class TenantAdminController {

    private final TenantRepository tenantRepository;
    private final PlatformAuditService auditService;
    private final PlatformUserService platformUserService;

    @GetMapping
    public ApiResponse<List<Tenant>> listTenants() {
        return ApiResponse.success(tenantRepository.findAll());
    }

    @GetMapping("/{tenantId}")
    public ApiResponse<Tenant> getTenant(@PathVariable UUID tenantId) {
        return ApiResponse.success(resolve(tenantId));
    }

    public record CreateTenantRequest(String name, String slug, String planName, String contactEmail, String contactName) {}

    @PostMapping
    public ResponseEntity<ApiResponse<Tenant>> createTenant(@RequestBody CreateTenantRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name is required");
        }
        Tenant tenant = new Tenant();
        tenant.setId(UUID.randomUUID());
        tenant.setName(request.name());
        tenant.setSlug(request.slug() != null && !request.slug().isBlank() ? request.slug() : slugify(request.name()));
        tenant.setPlanName(request.planName());
        tenant.setContactEmail(request.contactEmail());
        tenant.setContactName(request.contactName());
        tenant.setStatus(TenantStatus.ACTIVE);
        Tenant saved = tenantRepository.save(tenant);

        auditService.record(AuditAction.TENANT_CREATED, "TENANT", null, null, null,
                saved.getId().toString(), saved.getName(), null, saved.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(saved));
    }

    public record UpdateTenantRequest(String name, String contactEmail, String contactName) {}

    @PutMapping("/{tenantId}")
    public ApiResponse<Tenant> updateTenant(@PathVariable UUID tenantId, @RequestBody UpdateTenantRequest request) {
        Tenant tenant = resolve(tenantId);
        String previousValue = String.format("name=%s, contactEmail=%s, contactName=%s",
                tenant.getName(), tenant.getContactEmail(), tenant.getContactName());

        if (request.name() != null) tenant.setName(request.name());
        if (request.contactEmail() != null) tenant.setContactEmail(request.contactEmail());
        if (request.contactName() != null) tenant.setContactName(request.contactName());
        Tenant saved = tenantRepository.save(tenant);

        String newValue = String.format("name=%s, contactEmail=%s, contactName=%s",
                saved.getName(), saved.getContactEmail(), saved.getContactName());
        auditService.record(AuditAction.TENANT_UPDATED, "TENANT", null, null, null,
                saved.getId().toString(), saved.getName(), previousValue, newValue);
        return ApiResponse.success(saved);
    }

    public record SuspendRequest(String reason) {}

    @PostMapping("/{tenantId}/suspend")
    public ApiResponse<Tenant> suspendTenant(@PathVariable UUID tenantId, @RequestBody(required = false) SuspendRequest request) {
        Tenant tenant = resolve(tenantId);
        tenant.setStatus(TenantStatus.SUSPENDED);
        tenant.setSuspendedAt(OffsetDateTime.now());
        tenant.setSuspendedReason(request != null ? request.reason() : null);
        Tenant saved = tenantRepository.save(tenant);

        auditService.record(AuditAction.TENANT_SUSPENDED, "TENANT", null, null, null,
                saved.getId().toString(), saved.getName(), "ACTIVE",
                "SUSPENDED" + (saved.getSuspendedReason() != null ? " (" + saved.getSuspendedReason() + ")" : ""));
        return ApiResponse.success(saved);
    }

    @PostMapping("/{tenantId}/reactivate")
    public ApiResponse<Tenant> reactivateTenant(@PathVariable UUID tenantId) {
        Tenant tenant = resolve(tenantId);
        tenant.setStatus(TenantStatus.ACTIVE);
        tenant.setSuspendedAt(null);
        tenant.setSuspendedReason(null);
        Tenant saved = tenantRepository.save(tenant);

        auditService.record(AuditAction.TENANT_REACTIVATED, "TENANT", null, null, null,
                saved.getId().toString(), saved.getName(), "SUSPENDED", "ACTIVE");
        return ApiResponse.success(saved);
    }

    public record SetPlanRequest(String planName) {}

    @PatchMapping("/{tenantId}/plan")
    public ApiResponse<Tenant> setPlan(@PathVariable UUID tenantId, @RequestBody SetPlanRequest request) {
        Tenant tenant = resolve(tenantId);
        String previousPlan = tenant.getPlanName();
        tenant.setPlanName(request.planName());
        Tenant saved = tenantRepository.save(tenant);

        auditService.record(AuditAction.TENANT_PLAN_CHANGED, "TENANT", null, null, null,
                saved.getId().toString(), saved.getName(), previousPlan, saved.getPlanName());
        return ApiResponse.success(saved);
    }

    public record SetModulesRequest(Set<TenantModule> enabledModules) {}

    @PatchMapping("/{tenantId}/modules")
    public ApiResponse<Tenant> setModules(@PathVariable UUID tenantId, @RequestBody SetModulesRequest request) {
        Tenant tenant = resolve(tenantId);
        String previousModules = describeModules(tenant.getEnabledModules());
        tenant.setEnabledModules(request.enabledModules() != null ? request.enabledModules() : Set.of());
        Tenant saved = tenantRepository.save(tenant);

        auditService.record(AuditAction.TENANT_MODULES_CHANGED, "TENANT", null, null, null,
                saved.getId().toString(), saved.getName(), previousModules, describeModules(saved.getEnabledModules()));
        return ApiResponse.success(saved);
    }

    @DeleteMapping("/{tenantId}")
    public ApiResponse<Map<String, Boolean>> deleteTenant(@PathVariable UUID tenantId) {
        Tenant tenant = resolve(tenantId);

        long assignedUsers = platformUserService.countUsersInTenant(tenantId.toString());
        if (assignedUsers > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Cannot delete \"" + tenant.getName() + "\": " + assignedUsers
                            + " user(s) are still assigned to it. Move or delete them first.");
        }

        tenantRepository.delete(tenant);
        auditService.record(AuditAction.TENANT_DELETED, "TENANT", null, null, null,
                tenant.getId().toString(), tenant.getName(), tenant.getName(), null);
        return ApiResponse.success(Map.of("deleted", true));
    }

    // Mirrors TenantSignupController's slugify() — an admin-created tenant
    // with no explicit slug would otherwise be saved with slug=null, and a
    // second such tenant would then collide with it under Postgres's
    // NULLS-NOT-DISTINCT-by-default behavior... except when the DB treats
    // repeated NULLs as distinct, in which case every unnamed-slug tenant
    // instead silently ends up with no usable slug at all. Generating one
    // from the name keeps this endpoint consistent with the self-service
    // signup path, where a slug has always been mandatory.
    private static String slugify(String name) {
        String base = name.trim().toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        return base.isBlank() ? UUID.randomUUID().toString() : base;
    }

    private static String describeModules(Set<TenantModule> modules) {
        return modules == null || modules.isEmpty() ? "(none)"
                : modules.stream().map(Enum::name).sorted().reduce((a, b) -> a + ", " + b).orElse("(none)");
    }

    private Tenant resolve(UUID tenantId) {
        return tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown tenant: " + tenantId));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> handleDuplicateSlug(DataIntegrityViolationException ex) {
        // The only unique constraint on this table today is Tenant.slug —
        // surface a clear 409 instead of letting Hibernate's raw constraint
        // violation reach the client as an unhandled 500.
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.failure("ERR_DUPLICATE_SLUG", "A tenant with this slug already exists."));
    }
}
