package com.netcradus.acis.soar.service;

import com.netcradus.acis.soar.model.RedTeamSimulation;
import com.netcradus.acis.soar.model.RedTeamExecution;
import com.netcradus.acis.soar.repository.RedTeamExecutionRepository;
import com.netcradus.acis.soar.repository.RedTeamSimulationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class RedTeamService {

    private final RedTeamSimulationRepository simulationRepository;
    private final RedTeamExecutionRepository executionRepository;

    public List<RedTeamSimulation> getSimulations(UUID tenantId) {
        return simulationRepository.findByTenantId(tenantId);
    }

    public RedTeamSimulation createSimulation(RedTeamSimulation simulation) {
        return simulationRepository.save(simulation);
    }

    public Optional<RedTeamSimulation> getSimulation(UUID id) {
        return simulationRepository.findById(id);
    }

    @Transactional
    public RedTeamExecution startSimulation(UUID simulationId, UUID userId) {
        RedTeamSimulation simulation = simulationRepository.findById(simulationId)
            .orElseThrow(() -> new IllegalArgumentException("Simulation not found"));

        RedTeamExecution execution = new RedTeamExecution();
        execution.setSimulationId(simulationId);
        execution.setTriggeredBy(userId);
        execution.setStatus("running");
        
        execution = executionRepository.save(execution);

        simulation.setRunCount(simulation.getRunCount() + 1);
        simulation.setLastRunAt(OffsetDateTime.now());
        simulationRepository.save(simulation);

        executeSimulationAsync(execution.getId(), simulation);
        
        return execution;
    }

    @Async
    public void executeSimulationAsync(UUID executionId, RedTeamSimulation simulation) {
        log.info("Starting async execution for Red Team simulation: {} execution: {}", simulation.getName(), executionId);
        try {
            // Mocking execution logic here
            // In a real scenario, this would trigger actual tests
            Thread.sleep(3000); // simulate work
            
            RedTeamExecution execution = executionRepository.findById(executionId).orElseThrow();
            execution.setStatus("completed");
            execution.setCompletedAt(OffsetDateTime.now());
            
            execution.setStepLogs("[{\"step\":\"mock_simulation_step\",\"status\":\"success\",\"message\":\"Simulation completed successfully\"}]");
            
            executionRepository.save(execution);
            
            log.info("Completed async simulation execution for execution: {}", executionId);
        } catch (Exception e) {
            log.error("Simulation failed for " + executionId, e);
            RedTeamExecution execution = executionRepository.findById(executionId).orElse(null);
            if (execution != null) {
                execution.setStatus("failed");
                execution.setCompletedAt(OffsetDateTime.now());
                executionRepository.save(execution);
            }
        }
    }

    public Optional<RedTeamExecution> getExecution(UUID executionId) {
        return executionRepository.findById(executionId);
    }
}
