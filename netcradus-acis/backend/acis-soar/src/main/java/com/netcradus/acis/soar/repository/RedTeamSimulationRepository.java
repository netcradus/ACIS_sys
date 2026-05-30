package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.RedTeamSimulation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface RedTeamSimulationRepository extends JpaRepository<RedTeamSimulation, UUID> {
    List<RedTeamSimulation> findByTenantId(UUID tenantId);
}
