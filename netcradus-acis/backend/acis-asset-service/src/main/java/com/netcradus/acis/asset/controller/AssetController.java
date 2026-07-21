package com.netcradus.acis.asset.controller;

import com.netcradus.acis.asset.model.Asset;
import com.netcradus.acis.asset.service.AssetService;
import com.netcradus.acis.common.audit.AuditEventPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/assets")
@RequiredArgsConstructor
public class AssetController {

    private final AssetService assetService;
    private final AuditEventPublisher auditEventPublisher;

    @GetMapping
    public ResponseEntity<List<Asset>> getAllAssets(@RequestHeader("X-Tenant-ID") String tenantId) {
        return ResponseEntity.ok(assetService.findAll(tenantId));
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
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<Asset> updateAssetStatus(@PathVariable String id,
                                                    @RequestBody java.util.Map<String, Object> statusUpdate,
                                                    @RequestHeader("X-Tenant-ID") String tenantId) {
        return assetService.findById(id, tenantId).map(asset -> {
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
