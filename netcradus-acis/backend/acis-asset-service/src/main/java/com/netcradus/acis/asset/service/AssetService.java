package com.netcradus.acis.asset.service;

import com.netcradus.acis.asset.model.Asset;
import com.netcradus.acis.asset.repository.AssetRepository;
import com.netcradus.acis.common.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class AssetService {

    private final AssetRepository repository;

    @jakarta.annotation.PostConstruct
    public void initMockData() {
        // Centralized seeding is handled by AssetDataSeeder
    }

    public List<Asset> findAll(String tenantId) {
        return repository.findByTenantId(tenantId);
    }

    /** Real database-level pagination - added during the production-readiness audit (previously unbounded). */
    public org.springframework.data.domain.Page<Asset> findAll(String tenantId, org.springframework.data.domain.Pageable pageable) {
        return repository.findByTenantId(tenantId, pageable);
    }

    public Optional<Asset> findById(String id, String tenantId) {
        return repository.findByIdAndTenantId(id, tenantId);
    }

    public Optional<Asset> findByIpAddress(String ipAddress, String tenantId) {
        return repository.findByIpAddressAndTenantId(ipAddress, tenantId);
    }

    public Asset save(Asset asset) {
        log.info("Saving asset: {}", asset.getName());
        return repository.save(asset);
    }

    public void deleteById(String id, String tenantId) {
        Asset asset = repository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NotFoundException("Asset not found with id " + id));
        log.info("Deleting asset by ID: {}", id);
        repository.delete(asset);
    }

    public Asset update(String id, String tenantId, Asset assetDetails) {
        return repository.findByIdAndTenantId(id, tenantId).map(asset -> {
            asset.setName(assetDetails.getName());
            asset.setIpAddress(assetDetails.getIpAddress());
            asset.setMacAddress(assetDetails.getMacAddress());
            asset.setType(assetDetails.getType());
            asset.setStatus(assetDetails.getStatus());
            asset.setOwner(assetDetails.getOwner());
            asset.setLocation(assetDetails.getLocation());
            asset.setOs(assetDetails.getOs());
            asset.setCriticality(assetDetails.getCriticality());
            asset.setTags(assetDetails.getTags());
            return repository.save(asset);
        }).orElseThrow(() -> new NotFoundException("Asset not found with id " + id));
    }
}
