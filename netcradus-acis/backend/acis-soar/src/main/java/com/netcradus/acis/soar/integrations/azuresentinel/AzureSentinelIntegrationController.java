package com.netcradus.acis.soar.integrations.azuresentinel;

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
@RequestMapping("/api/soar/settings/azuresentinel")
@RequiredArgsConstructor
public class AzureSentinelIntegrationController {

    private final AzureSentinelIntegrationRepository repository;
    private final AzureSentinelClient client;
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

    /** Never returns the client secret — only whether one is configured, the workspace scope, and poll status. */
    @GetMapping
    public ApiResponse<Map<String, Object>> getConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        Optional<AzureSentinelIntegration> existing = repository.findByTenantId(resolveTenant(tenantId));
        Map<String, Object> body = new java.util.HashMap<>();
        if (existing.isPresent()) {
            AzureSentinelIntegration a = existing.get();
            body.put("configured", true);
            body.put("azureTenantId", a.getAzureTenantId());
            body.put("clientId", a.getClientId());
            body.put("subscriptionId", a.getSubscriptionId());
            body.put("resourceGroup", a.getResourceGroup());
            body.put("workspaceName", a.getWorkspaceName());
            body.put("enabled", a.isEnabled());
            body.put("lastPolledAt", a.getLastPolledAt() != null ? a.getLastPolledAt().toString() : null);
            body.put("lastPollStatus", a.getLastPollStatus());
            body.put("lastPollError", a.getLastPollError());
        } else {
            body.put("configured", false);
        }
        return ApiResponse.success(body);
    }

    public record SaveRequest(String azureTenantId, String clientId, String clientSecret,
                                String subscriptionId, String resourceGroup, String workspaceName, boolean enabled) {}

    @PutMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveConfig(@RequestBody SaveRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        if (req.azureTenantId() == null || req.azureTenantId().isBlank() || req.clientId() == null || req.clientId().isBlank()
                || req.subscriptionId() == null || req.subscriptionId().isBlank()
                || req.resourceGroup() == null || req.resourceGroup().isBlank()
                || req.workspaceName() == null || req.workspaceName().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Azure Tenant ID, Client ID, Subscription ID, Resource Group, and Workspace Name are all required"));
        }

        AzureSentinelIntegration config = repository.findByTenantId(tid).orElseGet(() -> {
            AzureSentinelIntegration a = new AzureSentinelIntegration();
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
        config.setSubscriptionId(req.subscriptionId().trim());
        config.setResourceGroup(req.resourceGroup().trim());
        config.setWorkspaceName(req.workspaceName().trim());
        config.setEnabled(req.enabled());

        if (config.getSystemApiKeyEncrypted() == null) {
            var issued = apiKeyIssuer.issue(tid, "System: Azure Sentinel Sync", "system");
            config.setSystemApiKeyEncrypted(CredentialEncryptor.encrypt(issued.rawToken(), encryptionKey));
        }

        repository.save(config);

        auditEventPublisher.publish("AZURESENTINEL_INTEGRATION_SAVE", "azuresentinel-integration/" + tid, "saved");
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("configured", true);
        body.put("workspaceName", config.getWorkspaceName());
        body.put("enabled", config.isEnabled());
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<ApiResponse<String>> deleteConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        repository.deleteByTenantId(tid);
        auditEventPublisher.publish("AZURESENTINEL_INTEGRATION_DELETE", "azuresentinel-integration/" + tid, "removed");
        return ResponseEntity.ok(ApiResponse.success("Azure Sentinel integration removed"));
    }

    public record TestRequest(String azureTenantId, String clientId, String clientSecret,
                                String subscriptionId, String resourceGroup, String workspaceName) {}

    @PostMapping("/test")
    public ResponseEntity<ApiResponse<String>> testConnection(@RequestBody TestRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        String azureTenantId = req.azureTenantId();
        String clientId = req.clientId();
        String clientSecret = req.clientSecret();
        String subscriptionId = req.subscriptionId();
        String resourceGroup = req.resourceGroup();
        String workspaceName = req.workspaceName();

        boolean anyBlank = azureTenantId == null || azureTenantId.isBlank() || clientId == null || clientId.isBlank()
                || subscriptionId == null || subscriptionId.isBlank() || resourceGroup == null || resourceGroup.isBlank()
                || workspaceName == null || workspaceName.isBlank();
        if (anyBlank || clientSecret == null || clientSecret.isBlank()) {
            var existing = repository.findByTenantId(tid);
            if (existing.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("No Azure Sentinel configuration to test — provide credentials or save one first"));
            }
            AzureSentinelIntegration e = existing.get();
            if (azureTenantId == null || azureTenantId.isBlank()) azureTenantId = e.getAzureTenantId();
            if (clientId == null || clientId.isBlank()) clientId = e.getClientId();
            if (subscriptionId == null || subscriptionId.isBlank()) subscriptionId = e.getSubscriptionId();
            if (resourceGroup == null || resourceGroup.isBlank()) resourceGroup = e.getResourceGroup();
            if (workspaceName == null || workspaceName.isBlank()) workspaceName = e.getWorkspaceName();
            if (clientSecret == null || clientSecret.isBlank()) {
                clientSecret = CredentialEncryptor.decrypt(e.getClientSecretEncrypted(), encryptionKey);
            }
        }

        try {
            client.testConnection(azureTenantId, clientId, clientSecret, subscriptionId, resourceGroup, workspaceName);
            return ResponseEntity.ok(ApiResponse.success("Connected successfully to Azure Sentinel workspace " + workspaceName));
        } catch (AzureSentinelClient.AzureSentinelApiException e) {
            return ResponseEntity.status(502).body(ApiResponse.error(e.getMessage()));
        }
    }
}
