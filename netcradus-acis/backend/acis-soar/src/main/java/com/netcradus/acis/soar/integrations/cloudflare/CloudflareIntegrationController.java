package com.netcradus.acis.soar.integrations.cloudflare;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.crypto.CredentialEncryptor;
import com.netcradus.acis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/soar/settings/cloudflare")
@RequiredArgsConstructor
public class CloudflareIntegrationController {

    private final CloudflareIntegrationRepository repository;
    private final CloudflareClient cloudflareClient;
    private final AuditEventPublisher auditEventPublisher;

    @Value("${acis.credential-encryption-key}")
    private String encryptionKey;

    private UUID resolveTenant(UUID tenantId) {
        if (tenantId == null) {
            throw new IllegalStateException("X-Tenant-ID missing; request should have been rejected upstream");
        }
        return tenantId;
    }

    /** Never returns the API token — only whether one is configured, plus the zone ID and enabled flag. */
    @GetMapping
    public ApiResponse<Map<String, Object>> getConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        Optional<CloudflareIntegration> existing = repository.findByTenantId(resolveTenant(tenantId));
        Map<String, Object> body = new java.util.HashMap<>();
        if (existing.isPresent()) {
            CloudflareIntegration c = existing.get();
            body.put("configured", true);
            body.put("zoneId", c.getZoneId());
            body.put("enabled", c.isEnabled());
            body.put("updatedAt", c.getUpdatedAt().toString());
        } else {
            body.put("configured", false);
        }
        return ApiResponse.success(body);
    }

    public record SaveRequest(String apiToken, String zoneId, boolean enabled) {}

    /**
     * apiToken may be blank on update — that means "keep the currently
     * stored token, just change zoneId/enabled" (mirrors the standard
     * "leave password field blank to keep it" pattern), since the raw
     * token is never sent back to the frontend to be resubmitted.
     */
    @PutMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveConfig(@RequestBody SaveRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        if (req.zoneId() == null || req.zoneId().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Zone ID is required"));
        }

        CloudflareIntegration config = repository.findByTenantId(tid).orElseGet(() -> {
            CloudflareIntegration c = new CloudflareIntegration();
            c.setTenantId(tid);
            return c;
        });

        if (req.apiToken() != null && !req.apiToken().isBlank()) {
            config.setApiTokenEncrypted(CredentialEncryptor.encrypt(req.apiToken().trim(), encryptionKey));
        } else if (config.getApiTokenEncrypted() == null) {
            return ResponseEntity.badRequest().body(ApiResponse.error("An API token is required for first-time setup"));
        }
        config.setZoneId(req.zoneId().trim());
        config.setEnabled(req.enabled());
        repository.save(config);

        auditEventPublisher.publish("CLOUDFLARE_INTEGRATION_SAVE", "cloudflare-integration/" + tid, "saved");
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("configured", true);
        body.put("zoneId", config.getZoneId());
        body.put("enabled", config.isEnabled());
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<ApiResponse<String>> deleteConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        repository.deleteByTenantId(tid);
        auditEventPublisher.publish("CLOUDFLARE_INTEGRATION_DELETE", "cloudflare-integration/" + tid, "removed");
        return ResponseEntity.ok(ApiResponse.success("Cloudflare integration removed"));
    }

    public record TestRequest(String apiToken, String zoneId) {}

    /**
     * Verifies credentials without blocking anything. Accepts an apiToken in
     * the request body (testing before saving) — if omitted, falls back to
     * the already-stored one so "Test" also works on an existing config.
     */
    @PostMapping("/test")
    public ResponseEntity<ApiResponse<String>> testConnection(@RequestBody TestRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        String zoneId = req.zoneId();
        String apiToken = req.apiToken();

        if (apiToken == null || apiToken.isBlank() || zoneId == null || zoneId.isBlank()) {
            var existing = repository.findByTenantId(tid);
            if (existing.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("No Cloudflare configuration to test — provide credentials or save one first"));
            }
            if (zoneId == null || zoneId.isBlank()) zoneId = existing.get().getZoneId();
            if (apiToken == null || apiToken.isBlank()) {
                apiToken = CredentialEncryptor.decrypt(existing.get().getApiTokenEncrypted(), encryptionKey);
            }
        }

        try {
            cloudflareClient.testConnection(apiToken, zoneId);
            return ResponseEntity.ok(ApiResponse.success("Connected successfully — this token can manage zone " + zoneId));
        } catch (CloudflareClient.CloudflareApiException e) {
            return ResponseEntity.status(502).body(ApiResponse.error(e.getMessage()));
        }
    }
}
