package com.netcradus.acis.soar.integrations.azuread;

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
@RequestMapping("/api/soar/settings/azuread")
@RequiredArgsConstructor
public class AzureAdIntegrationController {

    private final AzureAdIntegrationRepository repository;
    private final AzureAdClient client;
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

    /** Never returns the client secret — only whether one is configured and poll status. */
    @GetMapping
    public ApiResponse<Map<String, Object>> getConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        Optional<AzureAdIntegration> existing = repository.findByTenantId(resolveTenant(tenantId));
        Map<String, Object> body = new java.util.HashMap<>();
        if (existing.isPresent()) {
            AzureAdIntegration a = existing.get();
            body.put("configured", true);
            body.put("azureTenantId", a.getAzureTenantId());
            body.put("clientId", a.getClientId());
            body.put("enabled", a.isEnabled());
            body.put("lastPolledAt", a.getLastPolledAt() != null ? a.getLastPolledAt().toString() : null);
            body.put("lastPollStatus", a.getLastPollStatus());
            body.put("lastPollError", a.getLastPollError());
        } else {
            body.put("configured", false);
        }
        return ApiResponse.success(body);
    }

    public record SaveRequest(String azureTenantId, String clientId, String clientSecret, boolean enabled) {}

    @PutMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveConfig(@RequestBody SaveRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        if (req.azureTenantId() == null || req.azureTenantId().isBlank() || req.clientId() == null || req.clientId().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Azure Tenant ID and Client ID are required"));
        }

        AzureAdIntegration config = repository.findByTenantId(tid).orElseGet(() -> {
            AzureAdIntegration a = new AzureAdIntegration();
            a.setTenantId(tid);
            return a;
        });

        if (req.clientSecret() != null && !req.clientSecret().isBlank()) {
            config.setClientSecretEncrypted(CredentialEncryptor.encrypt(req.clientSecret().trim(), encryptionKey));
        } else if (config.getClientSecretEncrypted() == null) {
            return ResponseEntity.badRequest().body(ApiResponse.error("A client secret is required for first-time setup"));
        }
        config.setAzureTenantId(req.azureTenantId().trim());
        config.setClientId(req.clientId().trim());
        config.setEnabled(req.enabled());

        if (config.getSystemApiKeyEncrypted() == null) {
            var issued = apiKeyIssuer.issue(tid, "System: Azure AD Sign-in Sync", "system");
            config.setSystemApiKeyEncrypted(CredentialEncryptor.encrypt(issued.rawToken(), encryptionKey));
        }

        repository.save(config);

        auditEventPublisher.publish("AZUREAD_INTEGRATION_SAVE", "azuread-integration/" + tid, "saved");
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("configured", true);
        body.put("enabled", config.isEnabled());
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<ApiResponse<String>> deleteConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        repository.deleteByTenantId(tid);
        auditEventPublisher.publish("AZUREAD_INTEGRATION_DELETE", "azuread-integration/" + tid, "removed");
        return ResponseEntity.ok(ApiResponse.success("Azure AD integration removed"));
    }

    public record TestRequest(String azureTenantId, String clientId, String clientSecret) {}

    @PostMapping("/test")
    public ResponseEntity<ApiResponse<String>> testConnection(@RequestBody TestRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        String azureTenantId = req.azureTenantId();
        String clientId = req.clientId();
        String clientSecret = req.clientSecret();

        if (azureTenantId == null || azureTenantId.isBlank() || clientId == null || clientId.isBlank() || clientSecret == null || clientSecret.isBlank()) {
            var existing = repository.findByTenantId(tid);
            if (existing.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("No Azure AD configuration to test — provide credentials or save one first"));
            }
            AzureAdIntegration e = existing.get();
            if (azureTenantId == null || azureTenantId.isBlank()) azureTenantId = e.getAzureTenantId();
            if (clientId == null || clientId.isBlank()) clientId = e.getClientId();
            if (clientSecret == null || clientSecret.isBlank()) {
                clientSecret = CredentialEncryptor.decrypt(e.getClientSecretEncrypted(), encryptionKey);
            }
        }

        try {
            client.testConnection(azureTenantId, clientId, clientSecret);
            return ResponseEntity.ok(ApiResponse.success("Connected successfully to Azure AD tenant " + azureTenantId));
        } catch (AzureAdClient.AzureAdApiException e) {
            return ResponseEntity.status(502).body(ApiResponse.error(e.getMessage()));
        }
    }
}
