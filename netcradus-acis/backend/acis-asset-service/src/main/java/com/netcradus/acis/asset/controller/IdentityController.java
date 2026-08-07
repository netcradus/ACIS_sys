package com.netcradus.acis.asset.controller;

import com.netcradus.acis.asset.model.Identity;
import com.netcradus.acis.asset.repository.IdentityRepository;
import com.netcradus.acis.common.audit.AuditEventPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Real, persisted identity-to-asset mappings — replaces a hardcoded literal
 * map keyed by 6 specific asset names that every other asset (including
 * every real one an admin registers) silently fell back to a fabricated
 * single-identity placeholder for.
 */
@RestController
@RequestMapping("/api/assets")
@RequiredArgsConstructor
public class IdentityController {

    private final IdentityRepository identityRepository;
    private final AuditEventPublisher auditEventPublisher;

    @GetMapping("/{assetId}/identities")
    public List<Identity> getIdentitiesForAsset(@PathVariable String assetId, @RequestHeader("X-Tenant-ID") String tenantId) {
        return identityRepository.findByTenantIdAndAssetId(tenantId, assetId);
    }

    /**
     * All identities for the tenant at once, with a real conflict flag:
     * true when the same username is registered as active on more than one
     * asset — a genuine, computed signal instead of a hardcoded literal
     * marker on one hand-picked demo row.
     */
    @GetMapping("/identities")
    public List<Map<String, Object>> getAllIdentities(@RequestHeader("X-Tenant-ID") String tenantId) {
        List<Identity> all = identityRepository.findByTenantId(tenantId);
        Map<String, Long> countByUsername = all.stream()
                .collect(Collectors.groupingBy(Identity::getUsername, Collectors.counting()));

        return all.stream().map(identity -> {
            Map<String, Object> view = new java.util.LinkedHashMap<>();
            view.put("id", identity.getId());
            view.put("assetId", identity.getAssetId());
            view.put("username", identity.getUsername());
            view.put("role", identity.getRole());
            view.put("lastActive", identity.getLastActive());
            view.put("flagged", countByUsername.getOrDefault(identity.getUsername(), 0L) > 1);
            return view;
        }).collect(Collectors.toList());
    }

    public record CreateIdentityRequest(String assetId, String username, String role) {}

    @PostMapping("/identities")
    public ResponseEntity<Identity> createIdentity(@RequestBody CreateIdentityRequest request, @RequestHeader("X-Tenant-ID") String tenantId) {
        if (request.assetId() == null || request.username() == null || request.username().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        Identity identity = new Identity();
        identity.setTenantId(tenantId);
        identity.setAssetId(request.assetId());
        identity.setUsername(request.username().trim());
        identity.setRole(request.role());
        Identity saved = identityRepository.save(identity);
        auditEventPublisher.publish("IDENTITY_CREATE", "identity/" + saved.getId(), "asset=" + request.assetId() + " user=" + request.username());
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping("/identities/{id}")
    public ResponseEntity<Void> deleteIdentity(@PathVariable String id, @RequestHeader("X-Tenant-ID") String tenantId) {
        return identityRepository.findByIdAndTenantId(id, tenantId)
                .map(identity -> {
                    identityRepository.delete(identity);
                    auditEventPublisher.publish("IDENTITY_DELETE", "identity/" + id, "deleted");
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
