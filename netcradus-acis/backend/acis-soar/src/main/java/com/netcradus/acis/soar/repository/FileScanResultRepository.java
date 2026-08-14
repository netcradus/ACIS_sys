package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.FileScanResult;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FileScanResultRepository extends JpaRepository<FileScanResult, UUID> {
    List<FileScanResult> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);
    Optional<FileScanResult> findByIdAndTenantId(UUID id, UUID tenantId);
}
