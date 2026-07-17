package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.DataSource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DataSourceRepository extends JpaRepository<DataSource, UUID> {
    List<DataSource> findByTenantId(UUID tenantId);
    Optional<DataSource> findByIdAndTenantId(UUID id, UUID tenantId);
}
