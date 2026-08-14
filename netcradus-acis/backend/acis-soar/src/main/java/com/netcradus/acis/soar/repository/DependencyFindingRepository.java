package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.DependencyFinding;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DependencyFindingRepository extends JpaRepository<DependencyFinding, UUID> {
    List<DependencyFinding> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);
    List<DependencyFinding> findByScanIdAndTenantId(UUID scanId, UUID tenantId);
}
