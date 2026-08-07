package com.netcradus.acis.platformadmin.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.platformadmin.service.TenantActivationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/**
 * The public, unauthenticated counterpart to acis-soar's InvitationController
 * — a brand-new tenant's first administrator has no JWT until they actually
 * accept this link and set a password. See SecurityConfig's explicit
 * permitAll carve-out for this exact path (and acis-gateway's matching one,
 * required first since it's the first thing a request reaches).
 */
@RestController
@RequestMapping("/api/platform/activate")
@RequiredArgsConstructor
public class TenantActivationController {

    private final TenantActivationService activationService;

    @GetMapping("/{token}")
    public ApiResponse<TenantActivationService.ActivationPreview> preview(@PathVariable String token) {
        try {
            return ApiResponse.success(activationService.preview(token));
        } catch (TenantActivationService.InvalidActivationException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
    }

    public record AcceptRequest(String password) {}

    @PostMapping("/{token}")
    public ApiResponse<String> accept(@PathVariable String token, @RequestBody AcceptRequest request) {
        if (request.password() == null || request.password().length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password must be at least 8 characters");
        }
        try {
            activationService.accept(token, request.password());
        } catch (TenantActivationService.InvalidActivationException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
        return ApiResponse.success("Account activated");
    }
}
