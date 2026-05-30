package com.netcradus.acis.asset.controller;

import com.netcradus.acis.asset.model.Asset;
import com.netcradus.acis.asset.service.AssetService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/assets")
@RequiredArgsConstructor
public class AssetController {

    private final AssetService assetService;

    @GetMapping
    public ResponseEntity<List<Asset>> getAllAssets() {
        return ResponseEntity.ok(assetService.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Asset> getAssetById(@PathVariable String id) {
        return assetService.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/ip/{ipAddress}")
    public ResponseEntity<Asset> getAssetByIp(@PathVariable String ipAddress) {
        return assetService.findByIpAddress(ipAddress)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Asset> createAsset(@RequestBody Asset asset) {
        return ResponseEntity.ok(assetService.save(asset));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Asset> updateAsset(@PathVariable String id, @RequestBody Asset asset) {
        try {
            return ResponseEntity.ok(assetService.update(id, asset));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<Asset> updateAssetStatus(@PathVariable String id, @RequestBody java.util.Map<String, Object> statusUpdate) {
        return assetService.findById(id).map(asset -> {
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
            return ResponseEntity.ok(assetService.save(asset));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAsset(@PathVariable String id) {
        assetService.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
