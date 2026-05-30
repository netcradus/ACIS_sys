package com.netcradus.acis.asset.service;

import com.netcradus.acis.asset.model.Asset;
import com.netcradus.acis.asset.repository.AssetRepository;
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
        if (repository.count() == 0) {
            log.info("Generating initial mock assets...");
            save(com.netcradus.acis.asset.model.Asset.builder()
                .name("Primary-Gateway")
                .ipAddress("192.168.1.1")
                .type(com.netcradus.acis.asset.model.AssetType.NETWORK_DEVICE)
                .status(com.netcradus.acis.asset.model.AssetStatus.ACTIVE)
                .owner("IT-Net-Ops")
                .build());

            save(com.netcradus.acis.asset.model.Asset.builder()
                .name("HR-Workstation-01")
                .ipAddress("192.168.1.45")
                .type(com.netcradus.acis.asset.model.AssetType.WORKSTATION)
                .status(com.netcradus.acis.asset.model.AssetStatus.ACTIVE)
                .owner("Sarah-HR")
                .build());
            
            save(com.netcradus.acis.asset.model.Asset.builder()
                .name("Core-Database-Prod")
                .ipAddress("10.0.0.5")
                .type(com.netcradus.acis.asset.model.AssetType.SERVER)
                .status(com.netcradus.acis.asset.model.AssetStatus.ACTIVE)
                .owner("DB-Admins")
                .build());
        }
    }

    public List<Asset> findAll() {
        return repository.findAll();
    }

    public Optional<Asset> findById(String id) {
        return repository.findById(id);
    }

    public Optional<Asset> findByIpAddress(String ipAddress) {
        return repository.findByIpAddress(ipAddress);
    }

    public Asset save(Asset asset) {
        log.info("Saving asset: {}", asset.getName());
        return repository.save(asset);
    }

    public void deleteById(String id) {
        log.info("Deleting asset by ID: {}", id);
        repository.deleteById(id);
    }

    public Asset update(String id, Asset assetDetails) {
        return repository.findById(id).map(asset -> {
            asset.setName(assetDetails.getName());
            asset.setIpAddress(assetDetails.getIpAddress());
            asset.setMacAddress(assetDetails.getMacAddress());
            asset.setType(assetDetails.getType());
            asset.setStatus(assetDetails.getStatus());
            asset.setOwner(assetDetails.getOwner());
            asset.setLocation(assetDetails.getLocation());
            asset.setOs(assetDetails.getOs());
            return repository.save(asset);
        }).orElseThrow(() -> new RuntimeException("Asset not found with id " + id));
    }
}
