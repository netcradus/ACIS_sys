package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.RedTeamExecution;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface RedTeamExecutionRepository extends JpaRepository<RedTeamExecution, UUID> {
    List<RedTeamExecution> findBySimulationId(UUID simulationId);
    List<RedTeamExecution> findBySimulationIdIn(List<UUID> simulationIds);
}
