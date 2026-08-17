package com.netcradus.acis.asset.controller;

import com.netcradus.acis.asset.model.Asset;
import com.netcradus.acis.asset.service.AssetService;
import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.PageResponse;
import com.netcradus.acis.common.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/assets")
@RequiredArgsConstructor
public class AssetController {

    private static final int MAX_PAGE_SIZE = 500;

    private final AssetService assetService;
    private final AuditEventPublisher auditEventPublisher;

    /**
     * Real database-level pagination (added during the production-readiness
     * audit - this endpoint previously returned a tenant's entire asset
     * table unbounded). Defaults to 500 rows (the endpoint's own cap) rather
     * than a small page, since AssetsPage/EndpointsPage still do their
     * search/filtering client-side over the fetched set - this bounds the
     * query at the database level without requiring a larger client-side
     * pagination UI rework in the same change.
     */
    @GetMapping
    public ResponseEntity<PageResponse<Asset>> getAllAssets(
            @RequestHeader("X-Tenant-ID") String tenantId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "500") int size) {
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        PageRequest pageRequest = PageRequest.of(Math.max(page, 0), safeSize, Sort.by(Sort.Direction.ASC, "name"));
        return ResponseEntity.ok(PageResponse.of(assetService.findAll(tenantId, pageRequest)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Asset> getAssetById(@PathVariable String id, @RequestHeader("X-Tenant-ID") String tenantId) {
        return assetService.findById(id, tenantId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/ip/{ipAddress}")
    public ResponseEntity<Asset> getAssetByIp(@PathVariable String ipAddress, @RequestHeader("X-Tenant-ID") String tenantId) {
        return assetService.findByIpAddress(ipAddress, tenantId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Asset> createAsset(@RequestBody Asset asset, @RequestHeader("X-Tenant-ID") String tenantId) {
        asset.setTenantId(tenantId);
        Asset saved = assetService.save(asset);
        auditEventPublisher.publish("ASSET_CREATE", "asset/" + saved.getId(), "created");
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Asset> updateAsset(@PathVariable String id, @RequestBody Asset asset,
                                              @RequestHeader("X-Tenant-ID") String tenantId) {
        try {
            return ResponseEntity.ok(assetService.update(id, tenantId, asset));
        } catch (NotFoundException e) {
            // Only a genuine "no such asset" is a 404 - any other RuntimeException
            // (a bad field on the request body, a DB constraint violation) must
            // surface as a real error instead of being misreported as "not found".
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<?> updateAssetStatus(@PathVariable String id,
                                                    @RequestBody java.util.Map<String, Object> statusUpdate,
                                                    @RequestHeader("X-Tenant-ID") String tenantId) {
        // Real type validation instead of unchecked casts - a client sending
        // "isolated": "true" (string, not boolean) or a non-string health
        // value previously threw an uncaught ClassCastException -> raw 500.
        if (statusUpdate.containsKey("health") && statusUpdate.get("health") != null
                && !(statusUpdate.get("health") instanceof String)) {
            return ResponseEntity.badRequest().body("\"health\" must be a string");
        }
        if (statusUpdate.containsKey("isolated") && statusUpdate.get("isolated") != null
                && !(statusUpdate.get("isolated") instanceof Boolean)) {
            return ResponseEntity.badRequest().body("\"isolated\" must be a boolean");
        }
        return assetService.findById(id, tenantId).<ResponseEntity<?>>map(asset -> {
            if (statusUpdate.containsKey("health")) {
                asset.setHealth((String) statusUpdate.get("health"));
            }
            if (statusUpdate.containsKey("isolated")) {
                asset.setIsolationStatus((Boolean) statusUpdate.get("isolated"));
            }
            if (statusUpdate.containsKey("status") && "QUARANTINED".equals(statusUpdate.get("status"))) {
                asset.setStatus(com.netcradus.acis.asset.model.AssetStatus.INACTIVE);
            } else if (statusUpdate.containsKey("status") && "ACTIVE".equals(statusUpdate.get("status"))) {
                asset.setStatus(com.netcradus.acis.asset.model.AssetStatus.ACTIVE);
            }
            Asset saved = assetService.save(asset);
            auditEventPublisher.publish("ASSET_STATUS_CHANGE", "asset/" + id, "status=" + statusUpdate.get("status"));
            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAsset(@PathVariable String id, @RequestHeader("X-Tenant-ID") String tenantId) {
        assetService.deleteById(id, tenantId);
        auditEventPublisher.publish("ASSET_DELETE", "asset/" + id, "deleted");
        return ResponseEntity.noContent().build();
    }
}
