package com.netcradus.acis.platformadmin.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.platformadmin.dto.UserSecurityInfo;
import com.netcradus.acis.platformadmin.dto.UserSessionInfo;
import com.netcradus.acis.platformadmin.service.UserSecurityService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST controller for advanced user security management — password resets,
 * account locking, MFA management, and session management.
 *
 * All endpoints are gated by the blanket PLATFORM_ADMIN role in SecurityConfig.
 */
@RestController
@RequestMapping("/api/platform/users/{userId}/security")
@RequiredArgsConstructor
public class UserSecurityController {

    private final UserSecurityService userSecurityService;

    // ═══════════════════════════════════════════════════════════════════
    // Security Overview
    // ═══════════════════════════════════════════════════════════════════

    @GetMapping
    public ApiResponse<UserSecurityInfo> getSecurityInfo(@PathVariable String userId) {
        return ApiResponse.success(userSecurityService.getSecurityInfo(userId));
    }

    // ═══════════════════════════════════════════════════════════════════
    // Password Management
    // ═══════════════════════════════════════════════════════════════════

    public record ResetPasswordRequest(String newPassword, boolean temporary) {}

    @PostMapping("/password/reset")
    public ApiResponse<Map<String, Boolean>> resetPassword(
            @PathVariable String userId, @RequestBody ResetPasswordRequest request) {
        userSecurityService.resetPassword(userId, request.newPassword(), request.temporary());
        return ApiResponse.success(Map.of("passwordReset", true));
    }

    @PostMapping("/password/temp-generate")
    public ApiResponse<Map<String, String>> generateTempPassword(@PathVariable String userId) {
        String tempPassword = userSecurityService.generateTempPassword(userId);
        return ApiResponse.success(Map.of("tempPassword", tempPassword));
    }

    @PostMapping("/password/force-change")
    public ApiResponse<Map<String, Boolean>> forcePasswordChange(@PathVariable String userId) {
        userSecurityService.forcePasswordChangeOnNextLogin(userId);
        return ApiResponse.success(Map.of("forcePasswordChange", true));
    }

    @PostMapping("/password/send-reset-email")
    public ApiResponse<Map<String, Boolean>> sendPasswordResetEmail(@PathVariable String userId) {
        userSecurityService.sendPasswordResetEmail(userId);
        return ApiResponse.success(Map.of("emailSent", true));
    }

    // ═══════════════════════════════════════════════════════════════════
    // Account Locking
    // ═══════════════════════════════════════════════════════════════════

    @PostMapping("/lock")
    public ApiResponse<Map<String, Boolean>> lockAccount(@PathVariable String userId) {
        userSecurityService.lockAccount(userId);
        return ApiResponse.success(Map.of("locked", true));
    }

    @PostMapping("/unlock")
    public ApiResponse<Map<String, Boolean>> unlockAccount(@PathVariable String userId) {
        userSecurityService.unlockAccount(userId);
        return ApiResponse.success(Map.of("unlocked", true));
    }

    @PostMapping("/brute-force/clear")
    public ApiResponse<Map<String, Boolean>> clearBruteForce(@PathVariable String userId) {
        userSecurityService.clearBruteForceStatus(userId);
        return ApiResponse.success(Map.of("cleared", true));
    }

    // ═══════════════════════════════════════════════════════════════════
    // MFA Management
    // ═══════════════════════════════════════════════════════════════════

    @PostMapping("/mfa/require")
    public ApiResponse<Map<String, Boolean>> requireMfa(@PathVariable String userId) {
        userSecurityService.requireMfa(userId);
        return ApiResponse.success(Map.of("mfaRequired", true));
    }

    @PostMapping("/mfa/remove")
    public ApiResponse<Map<String, Boolean>> removeMfa(@PathVariable String userId) {
        userSecurityService.removeMfa(userId);
        return ApiResponse.success(Map.of("mfaRemoved", true));
    }

    @PostMapping("/mfa/reset")
    public ApiResponse<Map<String, Boolean>> resetMfa(@PathVariable String userId) {
        userSecurityService.resetMfaDevices(userId);
        return ApiResponse.success(Map.of("mfaReset", true));
    }

    // ═══════════════════════════════════════════════════════════════════
    // Session Management
    // ═══════════════════════════════════════════════════════════════════

    @GetMapping("/sessions")
    public ApiResponse<List<UserSessionInfo>> listSessions(@PathVariable String userId) {
        return ApiResponse.success(userSecurityService.listSessions(userId));
    }

    @DeleteMapping("/sessions/{sessionId}")
    public ApiResponse<Map<String, Boolean>> terminateSession(
            @PathVariable String userId, @PathVariable String sessionId) {
        userSecurityService.terminateSession(userId, sessionId);
        return ApiResponse.success(Map.of("terminated", true));
    }

    @DeleteMapping("/sessions")
    public ApiResponse<Map<String, Boolean>> terminateAllSessions(@PathVariable String userId) {
        userSecurityService.terminateAllSessions(userId);
        return ApiResponse.success(Map.of("allTerminated", true));
    }
}
