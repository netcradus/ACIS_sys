package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.soar.model.ApiKey;
import com.netcradus.acis.soar.model.Integration;
import com.netcradus.acis.soar.repository.ApiKeyRepository;
import com.netcradus.acis.soar.repository.IntegrationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.security.SecureRandom;

@RestController
@RequestMapping("/api/soar/settings")
@RequiredArgsConstructor
public class SettingsController {

    private final ApiKeyRepository apiKeyRepository;
    private final IntegrationRepository integrationRepository;

    @GetMapping("/keys")
    public ApiResponse<List<ApiKey>> getKeys() {
        return ApiResponse.success(apiKeyRepository.findAll());
    }

    @PostMapping("/keys")
    public ApiResponse<ApiKey> generateKey(@RequestBody ApiKey key) {
        key.setToken(generateRandomToken());
        key.setCreatedAt(OffsetDateTime.now());
        key.setStatus("Active");
        return ApiResponse.success(apiKeyRepository.save(key));
    }

    @PutMapping("/keys/{id}/revoke")
    public ApiResponse<ApiKey> revokeKey(@PathVariable UUID id) {
        return apiKeyRepository.findById(id)
                .map(k -> {
                    k.setStatus("Revoked");
                    return ApiResponse.success(apiKeyRepository.save(k));
                })
                .orElse(ApiResponse.error("Key not found"));
    }

    @DeleteMapping("/keys/{id}")
    public ApiResponse<String> deleteKey(@PathVariable UUID id) {
        apiKeyRepository.deleteById(id);
        return ApiResponse.success("Key deleted successfully");
    }

    @GetMapping("/integrations")
    public ApiResponse<List<Integration>> getIntegrations() {
        return ApiResponse.success(integrationRepository.findAll());
    }

    @PostMapping("/integrations")
    public ApiResponse<Integration> addIntegration(@RequestBody Integration integration) {
        integration.setStatus("Connected");
        return ApiResponse.success(integrationRepository.save(integration));
    }

    @PutMapping("/integrations/{id}/toggle")
    public ApiResponse<Integration> toggleIntegration(@PathVariable UUID id) {
        return integrationRepository.findById(id)
                .map(i -> {
                    i.setStatus("Connected".equals(i.getStatus()) ? "Disconnected" : "Connected");
                    return ApiResponse.success(integrationRepository.save(i));
                })
                .orElse(ApiResponse.error("Integration not found"));
    }

    private String generateRandomToken() {
        String chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        SecureRandom random = new SecureRandom();
        StringBuilder sb = new StringBuilder("oouraa_live_");
        for (int i = 0; i < 16; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        sb.append("...");
        for (int i = 0; i < 4; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }
}
