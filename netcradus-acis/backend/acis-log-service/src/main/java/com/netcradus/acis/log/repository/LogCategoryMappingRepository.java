package com.netcradus.acis.log.repository;

import com.netcradus.acis.log.model.LogCategoryMapping;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface LogCategoryMappingRepository extends JpaRepository<LogCategoryMapping, UUID> {
    List<LogCategoryMapping> findByTenantId(String tenantId);
    Optional<LogCategoryMapping> findByTenantIdAndServiceName(String tenantId, String serviceName);
}
