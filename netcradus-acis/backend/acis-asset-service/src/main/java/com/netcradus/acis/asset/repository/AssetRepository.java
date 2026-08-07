package com.netcradus.acis.asset.repository;

import com.netcradus.acis.asset.model.Asset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AssetRepository extends JpaRepository<Asset, String> {
    Optional<Asset> findByIpAddress(String ipAddress);
    List<Asset> findByTenantId(String tenantId);
    Optional<Asset> findByIdAndTenantId(String id, String tenantId);
    Optional<Asset> findByIpAddressAndTenantId(String ipAddress, String tenantId);

    @Query("SELECT DISTINCT a.tenantId FROM Asset a WHERE a.tenantId IS NOT NULL")
    List<String> findDistinctTenantIds();
}
