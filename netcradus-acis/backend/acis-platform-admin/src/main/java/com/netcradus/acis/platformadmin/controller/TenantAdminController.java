package com.netcradus.acis.platformadmin.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.platformadmin.model.Tenant;
import com.netcradus.acis.platformadmin.model.TenantModule;
import com.netcradus.acis.platformadmin.model.TenantStatus;
import com.netcradus.acis.platformadmin.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
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
 * callers (see TenantContextFilter's carve-out).
 */
@RestController
@RequestMapping("/api/platform/tenants")
@RequiredArgsConstructor
public class TenantAdminController {

    private final TenantRepository tenantRepository;

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
        tenant.setSlug(request.slug());
        tenant.setPlanName(request.planName());
        tenant.setContactEmail(request.contactEmail());
        tenant.setContactName(request.contactName());
        tenant.setStatus(TenantStatus.ACTIVE);
        Tenant saved = tenantRepository.save(tenant);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(saved));
    }

    public record UpdateTenantRequest(String name, String contactEmail, String contactName) {}

    @PutMapping("/{tenantId}")
    public ApiResponse<Tenant> updateTenant(@PathVariable UUID tenantId, @RequestBody UpdateTenantRequest request) {
        Tenant tenant = resolve(tenantId);
        if (request.name() != null) tenant.setName(request.name());
        if (request.contactEmail() != null) tenant.setContactEmail(request.contactEmail());
        if (request.contactName() != null) tenant.setContactName(request.contactName());
        return ApiResponse.success(tenantRepository.save(tenant));
    }

    public record SuspendRequest(String reason) {}

    @PostMapping("/{tenantId}/suspend")
    public ApiResponse<Tenant> suspendTenant(@PathVariable UUID tenantId, @RequestBody(required = false) SuspendRequest request) {
        Tenant tenant = resolve(tenantId);
        tenant.setStatus(TenantStatus.SUSPENDED);
        tenant.setSuspendedAt(OffsetDateTime.now());
        tenant.setSuspendedReason(request != null ? request.reason() : null);
        return ApiResponse.success(tenantRepository.save(tenant));
    }

    @PostMapping("/{tenantId}/reactivate")
    public ApiResponse<Tenant> reactivateTenant(@PathVariable UUID tenantId) {
        Tenant tenant = resolve(tenantId);
        tenant.setStatus(TenantStatus.ACTIVE);
        tenant.setSuspendedAt(null);
        tenant.setSuspendedReason(null);
        return ApiResponse.success(tenantRepository.save(tenant));
    }

    public record SetPlanRequest(String planName) {}

    @PatchMapping("/{tenantId}/plan")
    public ApiResponse<Tenant> setPlan(@PathVariable UUID tenantId, @RequestBody SetPlanRequest request) {
        Tenant tenant = resolve(tenantId);
        tenant.setPlanName(request.planName());
        return ApiResponse.success(tenantRepository.save(tenant));
    }

    public record SetModulesRequest(Set<TenantModule> enabledModules) {}

    @PatchMapping("/{tenantId}/modules")
    public ApiResponse<Tenant> setModules(@PathVariable UUID tenantId, @RequestBody SetModulesRequest request) {
        Tenant tenant = resolve(tenantId);
        tenant.setEnabledModules(request.enabledModules() != null ? request.enabledModules() : Set.of());
        return ApiResponse.success(tenantRepository.save(tenant));
    }

    @DeleteMapping("/{tenantId}")
    public ApiResponse<Map<String, Boolean>> deleteTenant(@PathVariable UUID tenantId) {
        Tenant tenant = resolve(tenantId);
        tenantRepository.delete(tenant);
        return ApiResponse.success(Map.of("deleted", true));
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
