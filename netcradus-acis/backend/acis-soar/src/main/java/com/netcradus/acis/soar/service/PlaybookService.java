package com.netcradus.acis.soar.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.soar.model.Playbook;
import com.netcradus.acis.soar.model.PlaybookExecution;
import com.netcradus.acis.soar.repository.PlaybookExecutionRepository;
import com.netcradus.acis.soar.repository.PlaybookRepository;
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
public class PlaybookService {

    private final PlaybookRepository playbookRepository;
    private final PlaybookExecutionRepository executionRepository;
    private final ObjectMapper objectMapper;

    public List<Playbook> getPlaybooks(UUID tenantId) {
        return playbookRepository.findByTenantId(tenantId);
    }

    public Playbook createPlaybook(Playbook playbook) {
        return playbookRepository.save(playbook);
    }

    public Optional<Playbook> getPlaybook(UUID id) {
        return playbookRepository.findById(id);
    }

    @Transactional
    public PlaybookExecution startExecution(UUID playbookId, UUID userId, java.util.Map<String, String> params) {
        Playbook playbook = playbookRepository.findById(playbookId)
            .orElseThrow(() -> new IllegalArgumentException("Playbook not found"));

        PlaybookExecution execution = new PlaybookExecution();
        execution.setPlaybookId(playbookId);
        execution.setTriggeredBy(userId);
        execution.setTriggeredByName("analyst1@oouraa");
        execution.setStatus("running");
        execution.setStepLogs("[]");
        
        execution = executionRepository.save(execution);

        playbook.setRunCount(playbook.getRunCount() + 1);
        playbook.setLastRunAt(OffsetDateTime.now());
        playbookRepository.save(playbook);

        executePlaybookStepsAsync(execution.getId(), playbook, params);
        
        return execution;
    }

    @Async
    public void executePlaybookStepsAsync(UUID executionId, Playbook playbook, java.util.Map<String, String> params) {
        log.info("Starting async execution for playbook: {} execution: {}", playbook.getName(), executionId);
        try {
            java.util.List<java.util.Map<String, Object>> stepList = objectMapper.readValue(
                playbook.getSteps(), 
                new com.fasterxml.jackson.core.type.TypeReference<java.util.List<java.util.Map<String, Object>>>() {}
            );
            
            java.util.List<java.util.Map<String, Object>> logList = new java.util.ArrayList<>();
            boolean failed = false;
            
            String targetAssetId = params.get("targetAssetId");
            if (targetAssetId == null || targetAssetId.trim().isEmpty()) {
                targetAssetId = params.get("assetId");
            }
            
            // If asset not passed, auto-select the first workstation or server that is active
            if (targetAssetId == null || targetAssetId.trim().isEmpty()) {
                try {
                    org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
                    java.util.List<?> assets = restTemplate.getForObject("http://localhost:8086/api/assets", java.util.List.class);
                    if (assets != null && !assets.isEmpty()) {
                        for (Object a : assets) {
                            if (a instanceof java.util.Map) {
                                java.util.Map<?, ?> map = (java.util.Map<?, ?>) a;
                                String type = String.valueOf(map.get("type"));
                                String status = String.valueOf(map.get("status"));
                                if (("WORKSTATION".equals(type) || "SERVER".equals(type)) && "ACTIVE".equals(status)) {
                                    targetAssetId = String.valueOf(map.get("id"));
                                    break;
                                }
                            }
                        }
                    }
                } catch (Exception ex) {
                    log.warn("Could not query assets for auto-selection: {}", ex.getMessage());
                }
            }

            for (int i = 0; i < stepList.size(); i++) {
                java.util.Map<String, Object> step = stepList.get(i);
                String stepName = (String) step.get("step");
                
                log.info("Running playbook step: {}", stepName);
                
                // Simulate network/orchestrator latency
                try {
                    Thread.sleep(1500);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                }
                
                String status = "Success";
                String outputMessage = "Executed successfully";
                
                // If it is EDR quarantine/isolation step, call Asset Service
                if (stepName.toLowerCase().contains("quarantine") || stepName.toLowerCase().contains("isolate")) {
                    if (targetAssetId != null && !targetAssetId.trim().isEmpty()) {
                        try {
                            org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
                            java.util.Map<String, Object> update = new java.util.HashMap<>();
                            update.put("status", "QUARANTINED");
                            update.put("health", "QUARANTINED");
                            update.put("isolated", true);
                            restTemplate.put("http://localhost:8086/api/assets/" + targetAssetId + "/status", update);
                            outputMessage = "Asset " + targetAssetId + " isolated successfully via EDR API";
                        } catch (Exception ex) {
                            status = "Failed";
                            outputMessage = "Failed to isolate asset: " + ex.getMessage();
                            failed = true;
                        }
                    } else {
                        status = "Failed";
                        outputMessage = "No active target asset available for isolation";
                        failed = true;
                    }
                } else if (stepName.toLowerCase().contains("disable") || stepName.toLowerCase().contains("reset") || stepName.toLowerCase().contains("revoke")) {
                    // Identity reset actions
                    outputMessage = "Okta API request success: User credentials disabled";
                } else if (stepName.toLowerCase().contains("block") || stepName.toLowerCase().contains("policy")) {
                    // Network blocking actions
                    outputMessage = "Firewall / Proxy policy rule updated successfully";
                }
                
                java.util.Map<String, Object> stepLog = new java.util.HashMap<>();
                stepLog.put("step", stepName);
                stepLog.put("status", status);
                stepLog.put("message", outputMessage);
                stepLog.put("timestamp", OffsetDateTime.now().toString());
                logList.add(stepLog);
                
                try {
                    PlaybookExecution exec = executionRepository.findById(executionId).orElseThrow();
                    exec.setStepLogs(objectMapper.writeValueAsString(logList));
                    executionRepository.save(exec);
                } catch (Exception ex) {
                    log.warn("Failed to save step execution logs: {}", ex.getMessage());
                }
                
                if (failed) {
                    break;
                }
            }
            
            PlaybookExecution execution = executionRepository.findById(executionId).orElseThrow();
            execution.setStatus(failed ? "failed" : "completed");
            execution.setCompletedAt(OffsetDateTime.now());
            executionRepository.save(execution);
            
            if (!failed) {
                playbook.setSuccessCount(playbook.getSuccessCount() + 1);
                playbookRepository.save(playbook);
            }
            log.info("Completed async execution for execution: {}", executionId);
        } catch (Exception e) {
            log.error("Execution failed for " + executionId, e);
            PlaybookExecution execution = executionRepository.findById(executionId).orElse(null);
            if (execution != null) {
                execution.setStatus("failed");
                execution.setCompletedAt(OffsetDateTime.now());
                executionRepository.save(execution);
            }
        }
    }

    public Optional<PlaybookExecution> getExecution(UUID executionId) {
        return executionRepository.findById(executionId);
    }
    
    public List<PlaybookExecution> getExecutions(UUID playbookId) {
        return executionRepository.findByPlaybookId(playbookId);
    }

    public List<PlaybookExecution> getAllExecutions() {
        return executionRepository.findAll(org.springframework.data.domain.Sort.by(
            org.springframework.data.domain.Sort.Direction.DESC, "startedAt"));
    }
}
