package com.netcradus.acis.soar.integrations.sentinelone;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.crypto.CredentialEncryptor;
import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.soar.support.ApiKeyIssuer;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/soar/settings/sentinelone")
@RequiredArgsConstructor
public class SentinelOneIntegrationController {

    private final SentinelOneIntegrationRepository repository;
    private final SentinelOneClient client;
    private final ApiKeyIssuer apiKeyIssuer;
    private final AuditEventPublisher auditEventPublisher;

    @Value("${acis.credential-encryption-key}")
    private String encryptionKey;

    private UUID resolveTenant(UUID tenantId) {
        if (tenantId == null) {
            throw new IllegalStateException("X-Tenant-ID missing; request should have been rejected upstream");
        }
        return tenantId;
    }

    /** Never returns the API token — only whether one is configured, the console URL, and poll status. */
    @GetMapping
    public ApiResponse<Map<String, Object>> getConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        Optional<SentinelOneIntegration> existing = repository.findByTenantId(resolveTenant(tenantId));
        Map<String, Object> body = new java.util.HashMap<>();
        if (existing.isPresent()) {
            SentinelOneIntegration s = existing.get();
            body.put("configured", true);
            body.put("consoleUrl", s.getConsoleUrl());
            body.put("enabled", s.isEnabled());
            body.put("lastPolledAt", s.getLastPolledAt() != null ? s.getLastPolledAt().toString() : null);
            body.put("lastPollStatus", s.getLastPollStatus());
            body.put("lastPollError", s.getLastPollError());
        } else {
            body.put("configured", false);
        }
        return ApiResponse.success(body);
    }

    public record SaveRequest(String consoleUrl, String apiToken, boolean enabled) {}

    @PutMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveConfig(@RequestBody SaveRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        if (req.consoleUrl() == null || req.consoleUrl().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Console URL is required"));
        }

        SentinelOneIntegration config = repository.findByTenantId(tid).orElseGet(() -> {
            SentinelOneIntegration s = new SentinelOneIntegration();
            s.setTenantId(tid);
            return s;
        });

        if (req.apiToken() != null && !req.apiToken().isBlank()) {
            config.setApiTokenEncrypted(CredentialEncryptor.encrypt(req.apiToken().trim(), encryptionKey));
        } else if (config.getApiTokenEncrypted() == null) {
            return ResponseEntity.badRequest().body(ApiResponse.error("An API token is required for first-time setup"));
        }
        config.setConsoleUrl(req.consoleUrl().trim());
        config.setEnabled(req.enabled());

        if (config.getSystemApiKeyEncrypted() == null) {
            var issued = apiKeyIssuer.issue(tid, "System: SentinelOne Sync", "system");
            config.setSystemApiKeyEncrypted(CredentialEncryptor.encrypt(issued.rawToken(), encryptionKey));
        }

        repository.save(config);

        auditEventPublisher.publish("SENTINELONE_INTEGRATION_SAVE", "sentinelone-integration/" + tid, "saved");
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("configured", true);
        body.put("consoleUrl", config.getConsoleUrl());
        body.put("enabled", config.isEnabled());
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<ApiResponse<String>> deleteConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        repository.deleteByTenantId(tid);
        auditEventPublisher.publish("SENTINELONE_INTEGRATION_DELETE", "sentinelone-integration/" + tid, "removed");
        return ResponseEntity.ok(ApiResponse.success("SentinelOne integration removed"));
    }

    public record TestRequest(String consoleUrl, String apiToken) {}

    @PostMapping("/test")
    public ResponseEntity<ApiResponse<String>> testConnection(@RequestBody TestRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        String consoleUrl = req.consoleUrl();
        String apiToken = req.apiToken();

        if (consoleUrl == null || consoleUrl.isBlank() || apiToken == null || apiToken.isBlank()) {
            var existing = repository.findByTenantId(tid);
            if (existing.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("No SentinelOne configuration to test — provide credentials or save one first"));
            }
            if (consoleUrl == null || consoleUrl.isBlank()) consoleUrl = existing.get().getConsoleUrl();
            if (apiToken == null || apiToken.isBlank()) {
                apiToken = CredentialEncryptor.decrypt(existing.get().getApiTokenEncrypted(), encryptionKey);
            }
        }

        try {
            client.testConnection(consoleUrl, apiToken);
            return ResponseEntity.ok(ApiResponse.success("Connected successfully to " + consoleUrl));
        } catch (SentinelOneClient.SentinelOneApiException e) {
            return ResponseEntity.status(502).body(ApiResponse.error(e.getMessage()));
        }
    }
}
