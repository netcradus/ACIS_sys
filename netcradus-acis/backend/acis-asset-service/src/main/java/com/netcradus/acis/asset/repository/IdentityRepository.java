package com.netcradus.acis.asset.repository;

import com.netcradus.acis.asset.model.Identity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface IdentityRepository extends JpaRepository<Identity, String> {
    List<Identity> findByTenantId(String tenantId);
    List<Identity> findByTenantIdAndAssetId(String tenantId, String assetId);
    Optional<Identity> findByIdAndTenantId(String id, String tenantId);
}
