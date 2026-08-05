package com.netcradus.acis.soar.integrations.wazuh;

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
@RequestMapping("/api/soar/settings/wazuh")
@RequiredArgsConstructor
public class WazuhIntegrationController {

    private final WazuhIntegrationRepository repository;
    private final WazuhClient client;
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

    /** Never returns the password — only whether one is configured, connection details, and poll status. */
    @GetMapping
    public ApiResponse<Map<String, Object>> getConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        Optional<WazuhIntegration> existing = repository.findByTenantId(resolveTenant(tenantId));
        Map<String, Object> body = new java.util.HashMap<>();
        if (existing.isPresent()) {
            WazuhIntegration w = existing.get();
            body.put("configured", true);
            body.put("baseUrl", w.getBaseUrl());
            body.put("username", w.getUsername());
            body.put("indexPattern", w.getIndexPattern());
            body.put("enabled", w.isEnabled());
            body.put("lastPolledAt", w.getLastPolledAt() != null ? w.getLastPolledAt().toString() : null);
            body.put("lastPollStatus", w.getLastPollStatus());
            body.put("lastPollError", w.getLastPollError());
        } else {
            body.put("configured", false);
        }
        return ApiResponse.success(body);
    }

    public record SaveRequest(String baseUrl, String username, String password, String indexPattern, boolean enabled) {}

    @PutMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveConfig(@RequestBody SaveRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        if (req.baseUrl() == null || req.baseUrl().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Indexer base URL is required"));
        }
        if (req.username() == null || req.username().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Username is required"));
        }

        WazuhIntegration config = repository.findByTenantId(tid).orElseGet(() -> {
            WazuhIntegration w = new WazuhIntegration();
            w.setTenantId(tid);
            return w;
        });

        if (req.password() != null && !req.password().isBlank()) {
            config.setPasswordEncrypted(CredentialEncryptor.encrypt(req.password().trim(), encryptionKey));
        } else if (config.getPasswordEncrypted() == null) {
            return ResponseEntity.badRequest().body(ApiResponse.error("A password is required for first-time setup"));
        }
        config.setBaseUrl(req.baseUrl().trim());
        config.setUsername(req.username().trim());
        config.setIndexPattern(req.indexPattern() != null && !req.indexPattern().isBlank() ? req.indexPattern().trim() : "wazuh-alerts-*");
        config.setEnabled(req.enabled());

        if (config.getSystemApiKeyEncrypted() == null) {
            var issued = apiKeyIssuer.issue(tid, "System: Wazuh Sync", "system");
            config.setSystemApiKeyEncrypted(CredentialEncryptor.encrypt(issued.rawToken(), encryptionKey));
        }

        repository.save(config);

        auditEventPublisher.publish("WAZUH_INTEGRATION_SAVE", "wazuh-integration/" + tid, "saved");
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("configured", true);
        body.put("baseUrl", config.getBaseUrl());
        body.put("enabled", config.isEnabled());
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<ApiResponse<String>> deleteConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        repository.deleteByTenantId(tid);
        auditEventPublisher.publish("WAZUH_INTEGRATION_DELETE", "wazuh-integration/" + tid, "removed");
        return ResponseEntity.ok(ApiResponse.success("Wazuh integration removed"));
    }

    public record TestRequest(String baseUrl, String username, String password) {}

    @PostMapping("/test")
    public ResponseEntity<ApiResponse<String>> testConnection(@RequestBody TestRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        String baseUrl = req.baseUrl();
        String username = req.username();
        String password = req.password();

        if (baseUrl == null || baseUrl.isBlank() || username == null || username.isBlank() || password == null || password.isBlank()) {
            var existing = repository.findByTenantId(tid);
            if (existing.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("No Wazuh configuration to test — provide credentials or save one first"));
            }
            if (baseUrl == null || baseUrl.isBlank()) baseUrl = existing.get().getBaseUrl();
            if (username == null || username.isBlank()) username = existing.get().getUsername();
            if (password == null || password.isBlank()) {
                password = CredentialEncryptor.decrypt(existing.get().getPasswordEncrypted(), encryptionKey);
            }
        }

        try {
            client.testConnection(baseUrl, username, password);
            return ResponseEntity.ok(ApiResponse.success("Connected successfully to " + baseUrl));
        } catch (WazuhClient.WazuhApiException e) {
            return ResponseEntity.status(502).body(ApiResponse.error(e.getMessage()));
        }
    }
}
