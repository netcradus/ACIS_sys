package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.AgentPolicy;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AgentPolicyRepository extends JpaRepository<AgentPolicy, UUID> {
    Optional<AgentPolicy> findByTenantId(UUID tenantId);
}
