package com.netcradus.acis.soar.integrations.paloalto;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.crypto.CredentialEncryptor;
import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.soar.support.ApiKeyIssuer;
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
@RequestMapping("/api/soar/settings/paloalto")
@RequiredArgsConstructor
public class PaloAltoIntegrationController {

    private final PaloAltoIntegrationRepository repository;
    private final PaloAltoClient client;
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

    /** Never returns the firewall API key — only whether one is configured, the hostname, and poll status. */
    @GetMapping
    public ApiResponse<Map<String, Object>> getConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        Optional<PaloAltoIntegration> existing = repository.findByTenantId(resolveTenant(tenantId));
        Map<String, Object> body = new java.util.HashMap<>();
        if (existing.isPresent()) {
            PaloAltoIntegration p = existing.get();
            body.put("configured", true);
            body.put("hostname", p.getHostname());
            body.put("enabled", p.isEnabled());
            body.put("lastPolledAt", p.getLastPolledAt() != null ? p.getLastPolledAt().toString() : null);
            body.put("lastPollStatus", p.getLastPollStatus());
            body.put("lastPollError", p.getLastPollError());
        } else {
            body.put("configured", false);
        }
        return ApiResponse.success(body);
    }

    public record SaveRequest(String hostname, String apiKey, boolean enabled) {}

    @PutMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveConfig(@RequestBody SaveRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        if (req.hostname() == null || req.hostname().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Firewall hostname is required"));
        }

        PaloAltoIntegration config = repository.findByTenantId(tid).orElseGet(() -> {
            PaloAltoIntegration p = new PaloAltoIntegration();
            p.setTenantId(tid);
            return p;
        });

        if (req.apiKey() != null && !req.apiKey().isBlank()) {
            config.setApiKeyEncrypted(CredentialEncryptor.encrypt(req.apiKey().trim(), encryptionKey));
        } else if (config.getApiKeyEncrypted() == null) {
            return ResponseEntity.badRequest().body(ApiResponse.error("A firewall API key is required for first-time setup"));
        }
        config.setHostname(req.hostname().trim());
        config.setEnabled(req.enabled());

        // Provisioned once, the first time this integration is saved — the
        // poller reuses it on every scheduled run rather than minting a new
        // key each cycle. It's an ordinary row in api_keys, so the tenant can
        // see/revoke it from Settings > API Keys like any key they made by hand.
        if (config.getSystemApiKeyEncrypted() == null) {
            var issued = apiKeyIssuer.issue(tid, "System: Palo Alto Sync", "system");
            config.setSystemApiKeyEncrypted(CredentialEncryptor.encrypt(issued.rawToken(), encryptionKey));
        }

        repository.save(config);

        auditEventPublisher.publish("PALOALTO_INTEGRATION_SAVE", "paloalto-integration/" + tid, "saved");
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("configured", true);
        body.put("hostname", config.getHostname());
        body.put("enabled", config.isEnabled());
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<ApiResponse<String>> deleteConfig(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        repository.deleteByTenantId(tid);
        auditEventPublisher.publish("PALOALTO_INTEGRATION_DELETE", "paloalto-integration/" + tid, "removed");
        return ResponseEntity.ok(ApiResponse.success("Palo Alto integration removed"));
    }

    public record TestRequest(String hostname, String apiKey) {}

    @PostMapping("/test")
    public ResponseEntity<ApiResponse<String>> testConnection(@RequestBody TestRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tid = resolveTenant(tenantId);
        String hostname = req.hostname();
        String apiKey = req.apiKey();

        if (apiKey == null || apiKey.isBlank() || hostname == null || hostname.isBlank()) {
            var existing = repository.findByTenantId(tid);
            if (existing.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error("No Palo Alto configuration to test — provide credentials or save one first"));
            }
            if (hostname == null || hostname.isBlank()) hostname = existing.get().getHostname();
            if (apiKey == null || apiKey.isBlank()) {
                apiKey = CredentialEncryptor.decrypt(existing.get().getApiKeyEncrypted(), encryptionKey);
            }
        }

        try {
            client.testConnection(hostname, apiKey);
            return ResponseEntity.ok(ApiResponse.success("Connected successfully to " + hostname));
        } catch (PaloAltoClient.PaloAltoApiException e) {
            return ResponseEntity.status(502).body(ApiResponse.error(e.getMessage()));
        }
    }
}
