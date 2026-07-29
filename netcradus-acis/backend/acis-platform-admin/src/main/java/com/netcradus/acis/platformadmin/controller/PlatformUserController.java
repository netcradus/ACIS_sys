package com.netcradus.acis.platformadmin.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.platformadmin.dto.PlatformUserDetail;
import com.netcradus.acis.platformadmin.dto.PlatformUserSummary;
import com.netcradus.acis.platformadmin.exception.CompanyAdminConflictException;
import com.netcradus.acis.platformadmin.exception.LastPlatformAdminException;
import com.netcradus.acis.platformadmin.service.PlatformUserService;
import jakarta.ws.rs.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Every endpoint here is already gated by SecurityConfig's blanket
 * .anyRequest().hasRole("PLATFORM_ADMIN") rule. The class-level @PreAuthorize
 * below is intentional defense-in-depth, not the primary gate — it guards
 * against a future refactor accidentally loosening the filter-chain rule.
 * All operations go through PlatformUserService, which talks to Keycloak's
 * Admin REST API — this service never manages users via a local database shortcut.
 */
@RestController
@RequestMapping("/api/platform/users")
@RequiredArgsConstructor
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class PlatformUserController {

    private final PlatformUserService platformUserService;

    @GetMapping
    public ApiResponse<List<PlatformUserSummary>> listUsers() {
        return ApiResponse.success(platformUserService.listUsers());
    }

    @GetMapping("/{userId}")
    public ApiResponse<PlatformUserDetail> getUser(@PathVariable String userId) {
        return ApiResponse.success(platformUserService.getUserDetail(userId));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, String>>> createUser(
            @RequestBody PlatformUserService.CreateUserRequest request) {
        String newUserId = platformUserService.createUser(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(Map.of("id", newUserId)));
    }

    @PutMapping("/{userId}")
    public ApiResponse<PlatformUserDetail> updateUser(
            @PathVariable String userId, @RequestBody PlatformUserService.UpdateUserRequest request) {
        platformUserService.updateProfile(userId, request);
        return ApiResponse.success(platformUserService.getUserDetail(userId));
    }

    @DeleteMapping("/{userId}")
    public ApiResponse<Map<String, Boolean>> deleteUser(@PathVariable String userId) {
        platformUserService.deleteUser(userId);
        return ApiResponse.success(Map.of("deleted", true));
    }

    @PostMapping("/{userId}/activate")
    public ApiResponse<PlatformUserDetail> activateUser(@PathVariable String userId) {
        platformUserService.setEnabled(userId, true);
        return ApiResponse.success(platformUserService.getUserDetail(userId));
    }

    @PostMapping("/{userId}/deactivate")
    public ApiResponse<PlatformUserDetail> deactivateUser(@PathVariable String userId) {
        platformUserService.setEnabled(userId, false);
        return ApiResponse.success(platformUserService.getUserDetail(userId));
    }

    public record MoveTenantRequest(String newTenantId) {
    }

    @PostMapping("/{userId}/move-tenant")
    public ApiResponse<PlatformUserDetail> moveTenant(
            @PathVariable String userId, @RequestBody MoveTenantRequest request) {
        platformUserService.moveTenant(userId, request.newTenantId());
        return ApiResponse.success(platformUserService.getUserDetail(userId));
    }

    @GetMapping("/{userId}/roles")
    public ApiResponse<List<String>> listRoles(@PathVariable String userId) {
        return ApiResponse.success(platformUserService.listUserRoles(userId));
    }

    public record RoleRequest(String role) {
    }

    @PostMapping("/{userId}/roles")
    public ApiResponse<List<String>> addRole(@PathVariable String userId, @RequestBody RoleRequest request) {
        platformUserService.assignRole(userId, request.role());
        return ApiResponse.success(platformUserService.listUserRoles(userId));
    }

    @DeleteMapping("/{userId}/roles/{role}")
    public ApiResponse<List<String>> removeRole(@PathVariable String userId, @PathVariable String role) {
        platformUserService.removeRole(userId, role);
        return ApiResponse.success(platformUserService.listUserRoles(userId));
    }

    @ExceptionHandler(CompanyAdminConflictException.class)
    public ResponseEntity<ApiResponse<Void>> handleCompanyAdminConflict(CompanyAdminConflictException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.failure("ERR_COMPANY_ADMIN_EXISTS", ex.getMessage()
                        + " Remove that role first, or move this user's tenant, before assigning it here."));
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleKeycloakNotFound(NotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.failure("ERR_NOT_FOUND", "The requested identity resource was not found."));
    }

    @ExceptionHandler(LastPlatformAdminException.class)
    public ResponseEntity<ApiResponse<Void>> handleLastPlatformAdmin(LastPlatformAdminException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.failure("ERR_LAST_PLATFORM_ADMIN", ex.getMessage()));
    }
}
