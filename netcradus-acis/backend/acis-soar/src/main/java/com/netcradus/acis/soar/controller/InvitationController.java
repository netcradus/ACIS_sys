package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.soar.service.InvitationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * The one deliberately public, unauthenticated surface owned by acis-soar —
 * mirrors acis-platform-admin's TenantSignupController in spirit (a real
 * account gets provisioned from here, but only after a valid, single-use
 * token proves the caller is who the invite was sent to). See SecurityConfig
 * (this service) and acis-gateway's SecurityConfig for the matching
 * permitAll carve-outs, and InvitationService's Javadoc for why no Keycloak
 * account exists until accept() actually runs.
 */
@RestController
@RequestMapping("/api/invitations")
@RequiredArgsConstructor
public class InvitationController {

    private static final int MIN_PASSWORD_LENGTH = 8;

    private final InvitationService invitationService;

    @GetMapping("/{token}")
    public ResponseEntity<ApiResponse<InvitationService.InvitationPreview>> preview(@PathVariable String token) {
        try {
            return ResponseEntity.ok(ApiResponse.success(invitationService.preview(token)));
        } catch (InvitationService.InvalidInvitationException e) {
            return ResponseEntity.status(HttpStatus.GONE).body(ApiResponse.error(e.getMessage()));
        }
    }

    public record AcceptRequest(String password) {}

    @PostMapping("/{token}/accept")
    public ResponseEntity<ApiResponse<String>> accept(@PathVariable String token, @RequestBody AcceptRequest request) {
        String password = request.password();
        if (password == null || password.length() < MIN_PASSWORD_LENGTH) {
            return ResponseEntity.badRequest().body(ApiResponse.error(
                    "Password must be at least " + MIN_PASSWORD_LENGTH + " characters"));
        }
        try {
            invitationService.accept(token, password);
            return ResponseEntity.ok(ApiResponse.success("Invitation accepted — you can now log in."));
        } catch (InvitationService.InvalidInvitationException e) {
            return ResponseEntity.status(HttpStatus.GONE).body(ApiResponse.error(e.getMessage()));
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(ApiResponse.error(
                    "Could not create your account: " + e.getMessage()));
        }
    }
}
