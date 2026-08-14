package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.ContainmentApproval;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ContainmentApprovalRepository extends JpaRepository<ContainmentApproval, UUID> {
    List<ContainmentApproval> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);
    Optional<ContainmentApproval> findByIdAndTenantId(UUID id, UUID tenantId);
}
