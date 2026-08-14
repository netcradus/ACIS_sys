package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.SecretFinding;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SecretFindingRepository extends JpaRepository<SecretFinding, UUID> {
    List<SecretFinding> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);
    List<SecretFinding> findByScanIdAndTenantId(UUID scanId, UUID tenantId);
}
