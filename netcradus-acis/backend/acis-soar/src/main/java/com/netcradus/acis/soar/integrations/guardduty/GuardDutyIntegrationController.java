package com.netcradus.acis.soar.integrations.guardduty;

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
@RequestMapping("/api/soar/settings/guardduty")
@RequiredArgsConstructor
public class GuardDutyIntegrationController {

    private final GuardDutyIntegrationRepository repository;
    private final GuardDutyClient client;
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

    /** Never returns the secret access key — only whether one is configured, the region, and poll status. */
    @GetMapping
    public ApiResponse<Map<String, Object>> getConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        Optional<GuardDutyIntegration> existing = repository.findByTenantId(resolveTenant(tenantId));
        Map<String, Object> body = new java.util.HashMap<>();
        if (existing.isPresent()) {
            GuardDutyIntegration g = existing.get();
            body.put("configured", true);
            body.put("region", g.getRegion());
            body.put("enabled", g.isEnabled());
            body.put("lastPolledAt", g.getLastPolledAt() != null ? g.getLastPolledAt().toString() : null);
            body.put("lastPollStatus", g.getLastPollStatus());
            body.put("lastPollError", g.getLastPollError());
        } else {
            body.put("configured", false);
        }
        return ApiResponse.success(body);
    }

    public record SaveRequest(String accessKeyId, String secretAccessKey, String region, boolean enabled) {}

    @PutMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveConfig(@RequestBody SaveRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        if (req.region() == null || req.region().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("AWS region is required"));
        }
        if (req.accessKeyId() == null || req.accessKeyId().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Access Key ID is required"));
        }

        GuardDutyIntegration config = repository.findByTenantId(tid).orElseGet(() -> {
            GuardDutyIntegration g = new GuardDutyIntegration();
            g.setTenantId(tid);
            return g;
        });

        config.setAccessKeyIdEncrypted(CredentialEncryptor.encrypt(req.accessKeyId().trim(), encryptionKey));
        if (req.secretAccessKey() != null && !req.secretAccessKey().isBlank()) {
            config.setSecretAccessKeyEncrypted(CredentialEncryptor.encrypt(req.secretAccessKey().trim(), encryptionKey));
        } else if (config.getSecretAccessKeyEncrypted() == null) {
            return ResponseEntity.badRequest().body(ApiResponse.error("A secret access key is required for first-time setup"));
        }
        config.setRegion(req.region().trim());
        config.setEnabled(req.enabled());

        if (config.getSystemApiKeyEncrypted() == null) {
            var issued = apiKeyIssuer.issue(tid, "System: AWS GuardDuty Sync", "system");
            config.setSystemApiKeyEncrypted(CredentialEncryptor.encrypt(issued.rawToken(), encryptionKey));
        }

        repository.save(config);

        auditEventPublisher.publish("GUARDDUTY_INTEGRATION_SAVE", "guardduty-integration/" + tid, "saved");
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("configured", true);
        body.put("region", config.getRegion());
        body.put("enabled", config.isEnabled());
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<ApiResponse<String>> deleteConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        repository.deleteByTenantId(tid);
        auditEventPublisher.publish("GUARDDUTY_INTEGRATION_DELETE", "guardduty-integration/" + tid, "removed");
        return ResponseEntity.ok(ApiResponse.success("AWS GuardDuty integration removed"));
    }

    public record TestRequest(String accessKeyId, String secretAccessKey, String region) {}

    @PostMapping("/test")
    public ResponseEntity<ApiResponse<String>> testConnection(@RequestBody TestRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        String accessKeyId = req.accessKeyId();
        String secretAccessKey = req.secretAccessKey();
        String region = req.region();

        if (accessKeyId == null || accessKeyId.isBlank() || secretAccessKey == null || secretAccessKey.isBlank() || region == null || region.isBlank()) {
            var existing = repository.findByTenantId(tid);
            if (existing.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("No AWS GuardDuty configuration to test — provide credentials or save one first"));
            }
            if (region == null || region.isBlank()) region = existing.get().getRegion();
            if (accessKeyId == null || accessKeyId.isBlank()) {
                accessKeyId = CredentialEncryptor.decrypt(existing.get().getAccessKeyIdEncrypted(), encryptionKey);
            }
            if (secretAccessKey == null || secretAccessKey.isBlank()) {
                secretAccessKey = CredentialEncryptor.decrypt(existing.get().getSecretAccessKeyEncrypted(), encryptionKey);
            }
        }

        try {
            client.testConnection(accessKeyId, secretAccessKey, region);
            return ResponseEntity.ok(ApiResponse.success("Connected successfully to AWS GuardDuty in " + region));
        } catch (GuardDutyClient.GuardDutyApiException e) {
            return ResponseEntity.status(502).body(ApiResponse.error(e.getMessage()));
        }
    }
}
