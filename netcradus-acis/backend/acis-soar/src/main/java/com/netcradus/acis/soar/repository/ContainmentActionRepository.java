package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.ContainmentAction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ContainmentActionRepository extends JpaRepository<ContainmentAction, UUID> {
    List<ContainmentAction> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);
    Optional<ContainmentAction> findByIdAndTenantId(UUID id, UUID tenantId);
}
