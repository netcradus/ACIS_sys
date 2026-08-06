package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.AgentEndpoint;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AgentEndpointRepository extends JpaRepository<AgentEndpoint, UUID> {
    List<AgentEndpoint> findByTenantId(UUID tenantId);
    Optional<AgentEndpoint> findByIdAndTenantId(UUID id, UUID tenantId);
    Optional<AgentEndpoint> findByTenantIdAndAgentId(UUID tenantId, String agentId);
}
