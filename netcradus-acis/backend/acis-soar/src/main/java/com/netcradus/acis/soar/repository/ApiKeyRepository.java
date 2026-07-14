package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.ApiKey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ApiKeyRepository extends JpaRepository<ApiKey, UUID> {
    List<ApiKey> findByTenantId(UUID tenantId);
    Optional<ApiKey> findByIdAndTenantId(UUID id, UUID tenantId);
}
