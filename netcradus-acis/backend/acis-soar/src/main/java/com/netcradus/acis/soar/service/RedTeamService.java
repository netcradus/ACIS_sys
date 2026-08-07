package com.netcradus.acis.soar.service;

import com.netcradus.acis.soar.model.RedTeamSimulation;
import com.netcradus.acis.soar.model.RedTeamExecution;
import com.netcradus.acis.soar.model.SyntheticLogEvent;
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
    private final org.springframework.kafka.core.KafkaTemplate<String, Object> kafkaTemplate;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    public List<RedTeamSimulation> getSimulations(UUID tenantId) {
        return simulationRepository.findByTenantId(tenantId);
    }

    public RedTeamSimulation createSimulation(RedTeamSimulation simulation) {
        return simulationRepository.save(simulation);
    }

    public Optional<RedTeamSimulation> getSimulation(UUID id, UUID tenantId) {
        return simulationRepository.findByIdAndTenantId(id, tenantId);
    }

    @Transactional
    public RedTeamExecution startSimulation(UUID simulationId, UUID tenantId, UUID userId) {
        RedTeamSimulation simulation = simulationRepository.findByIdAndTenantId(simulationId, tenantId)
            .orElseThrow(() -> new IllegalArgumentException("Simulation not found"));

        RedTeamExecution execution = new RedTeamExecution();
        execution.setSimulationId(simulationId);
        execution.setTriggeredBy(userId);
        execution.setStatus("running");
        
        execution = executionRepository.save(execution);

        simulation.setRunCount(simulation.getRunCount() + 1);
        simulation.setLastRunAt(OffsetDateTime.now());
        simulationRepository.save(simulation);

        executeSimulationAsync(execution.getId(), simulation, tenantId);

        return execution;
    }

    @Async
    public void executeSimulationAsync(UUID executionId, RedTeamSimulation simulation, UUID tenantId) {
        log.info("Starting async execution for Red Team simulation: {} execution: {}", simulation.getName(), executionId);
        try {
            java.util.List<SyntheticLogEvent> stages = new java.util.ArrayList<>();
            String name = simulation.getName().toLowerCase();
            
            if (name.contains("phishing")) {
                stages.add(SyntheticLogEvent.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId.toString())
                    .timestamp(java.time.Instant.now())
                    .message("[RED-TEAM] Spearphishing Email Sent to analyst1@acme.local")
                    .level("INFO")
                    .service("email-service")
                    .host("smtp.acme.local")
                    .metadata(java.util.Map.of("technique", "T1566.001", "category", "RED_TEAM_SIM"))
                    .build());
                stages.add(SyntheticLogEvent.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId.toString())
                    .timestamp(java.time.Instant.now())
                    .message("[RED-TEAM] User opened malicious attachment and initiated payload execution")
                    .level("WARN")
                    .service("endpoint-service")
                    .host("laptop-332.acme.local")
                    .metadata(java.util.Map.of("technique", "T1204.002", "category", "RED_TEAM_SIM"))
                    .build());
                stages.add(SyntheticLogEvent.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId.toString())
                    .timestamp(java.time.Instant.now())
                    .message("[RED-TEAM] Suspicious powershell.exe command execution detected")
                    .level("CRITICAL")
                    .service("edr-agent")
                    .host("laptop-332.acme.local")
                    .metadata(java.util.Map.of("technique", "T1059.001", "category", "RED_TEAM_SIM"))
                    .build());
                stages.add(SyntheticLogEvent.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId.toString())
                    .timestamp(java.time.Instant.now())
                    .message("[RED-TEAM] C2 Beacon established to high-risk external IP 45.122.3.1")
                    .level("CRITICAL")
                    .service("firewall")
                    .host("gateway-01.acme.local")
                    .metadata(java.util.Map.of("technique", "T1071.001", "category", "RED_TEAM_SIM"))
                    .build());
            } else if (name.contains("lateral")) {
                stages.add(SyntheticLogEvent.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId.toString())
                    .timestamp(java.time.Instant.now())
                    .message("[RED-TEAM] SMB Admin Share Access attempt on Target: laptop-332.acme.local")
                    .level("WARN")
                    .service("endpoint-service")
                    .host("workstation-88.acme.local")
                    .metadata(java.util.Map.of("technique", "T1021.002", "category", "RED_TEAM_SIM"))
                    .build());
                stages.add(SyntheticLogEvent.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId.toString())
                    .timestamp(java.time.Instant.now())
                    .message("[RED-TEAM] WMI Remote Execution request using cmd.exe /c powershell.exe")
                    .level("CRITICAL")
                    .service("edr-agent")
                    .host("laptop-332.acme.local")
                    .metadata(java.util.Map.of("technique", "T1047", "category", "RED_TEAM_SIM"))
                    .build());
                stages.add(SyntheticLogEvent.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId.toString())
                    .timestamp(java.time.Instant.now())
                    .message("[RED-TEAM] RDP Lateral connection established using Admin credentials")
                    .level("CRITICAL")
                    .service("edr-agent")
                    .host("laptop-332.acme.local")
                    .metadata(java.util.Map.of("technique", "T1076", "category", "RED_TEAM_SIM"))
                    .build());
                stages.add(SyntheticLogEvent.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId.toString())
                    .timestamp(java.time.Instant.now())
                    .message("[RED-TEAM] Sensitive credentials dumped via LSASS memory read for Admin")
                    .level("CRITICAL")
                    .service("edr-agent")
                    .host("laptop-332.acme.local")
                    .metadata(java.util.Map.of("technique", "T1003.001", "category", "RED_TEAM_SIM"))
                    .build());
            } else {
                stages.add(SyntheticLogEvent.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId.toString())
                    .timestamp(java.time.Instant.now())
                    .message("[RED-TEAM] Sensitive data staging collected in temporary directory")
                    .level("INFO")
                    .service("endpoint-service")
                    .host("laptop-332.acme.local")
                    .metadata(java.util.Map.of("technique", "T1074.001", "category", "RED_TEAM_SIM"))
                    .build());
                stages.add(SyntheticLogEvent.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId.toString())
                    .timestamp(java.time.Instant.now())
                    .message("[RED-TEAM] High-frequency dns_tunnelling queries signature matched")
                    .level("CRITICAL")
                    .service("ids-ips")
                    .host("dns-server.acme.local")
                    .metadata(java.util.Map.of("technique", "T1048.003", "category", "RED_TEAM_SIM"))
                    .build());
                stages.add(SyntheticLogEvent.builder()
                    .id(UUID.randomUUID().toString())
                    .tenantId(tenantId.toString())
                    .timestamp(java.time.Instant.now())
                    .message("[RED-TEAM] DNS tunnel exfiltration payload byte stream outbound transfer complete")
                    .level("CRITICAL")
                    .service("firewall")
                    .host("gateway-01.acme.local")
                    .metadata(java.util.Map.of("technique", "T1041", "category", "RED_TEAM_SIM"))
                    .build());
            }

            java.util.List<java.util.Map<String, Object>> logList = new java.util.ArrayList<>();
            
            for (int i = 0; i < stages.size(); i++) {
                SyntheticLogEvent stageLog = stages.get(i);
                
                log.info("Executing simulation step {}: {}", i + 1, stageLog.getMessage());
                
                // Send log to Kafka
                kafkaTemplate.send("acis-logs", stageLog);
                
                // Log this step progress
                java.util.Map<String, Object> stepLog = new java.util.HashMap<>();
                stepLog.put("stage", i + 1);
                stepLog.put("name", stageLog.getMessage());
                stepLog.put("status", "success");
                stepLog.put("technique", stageLog.getMetadata() != null ? stageLog.getMetadata().get("technique") : null);
                stepLog.put("timestamp", OffsetDateTime.now().toString());
                logList.add(stepLog);
                
                try {
                    RedTeamExecution exec = executionRepository.findById(executionId).orElseThrow();
                    exec.setStepLogs(objectMapper.writeValueAsString(logList));
                    executionRepository.save(exec);
                } catch (Exception ex) {
                    log.warn("Failed to update step logs: {}", ex.getMessage());
                }
                
                // Sleep to simulate time between steps
                try {
                    Thread.sleep(2500);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                }
            }
            
            RedTeamExecution execution = executionRepository.findById(executionId).orElseThrow();
            execution.setStatus("completed");
            execution.setCompletedAt(OffsetDateTime.now());
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

    /** Returns the execution only if it belongs to a simulation owned by the given tenant. */
    public Optional<RedTeamExecution> getExecution(UUID executionId, UUID tenantId) {
        return executionRepository.findById(executionId)
                .filter(exec -> simulationRepository.findByIdAndTenantId(exec.getSimulationId(), tenantId).isPresent());
    }

    /**
     * All real executions across every simulation owned by the tenant, newest
     * first, with the owning simulation's name/techniques attached — powers
     * the frontend's execution history table and coverage stats, replacing
     * client-side formulas that fabricated coverage/duration/status figures.
     */
    public List<java.util.Map<String, Object>> getAllExecutionViews(UUID tenantId) {
        List<RedTeamSimulation> simulations = simulationRepository.findByTenantId(tenantId);
        java.util.Map<UUID, RedTeamSimulation> simulationsById = new java.util.HashMap<>();
        for (RedTeamSimulation simulation : simulations) {
            simulationsById.put(simulation.getId(), simulation);
        }

        List<RedTeamExecution> executions = executionRepository.findBySimulationIdIn(new java.util.ArrayList<>(simulationsById.keySet()));
        executions.sort((a, b) -> {
            if (a.getStartedAt() == null || b.getStartedAt() == null) return 0;
            return b.getStartedAt().compareTo(a.getStartedAt());
        });

        List<java.util.Map<String, Object>> views = new java.util.ArrayList<>();
        for (RedTeamExecution execution : executions) {
            RedTeamSimulation simulation = simulationsById.get(execution.getSimulationId());
            java.util.Map<String, Object> view = new java.util.LinkedHashMap<>();
            view.put("id", execution.getId());
            view.put("simulationId", execution.getSimulationId());
            view.put("simulationName", simulation != null ? simulation.getName() : "Unknown Simulation");
            view.put("mitreTechniques", simulation != null ? simulation.getMitreTechniques() : java.util.List.of());
            view.put("status", execution.getStatus());
            view.put("stepLogs", execution.getStepLogs());
            view.put("startedAt", execution.getStartedAt());
            view.put("completedAt", execution.getCompletedAt());
            views.add(view);
        }
        return views;
    }
}
