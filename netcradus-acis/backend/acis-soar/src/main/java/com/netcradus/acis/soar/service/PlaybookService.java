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
    public PlaybookExecution startExecution(UUID playbookId, UUID userId) {
        Playbook playbook = playbookRepository.findById(playbookId)
            .orElseThrow(() -> new IllegalArgumentException("Playbook not found"));

        PlaybookExecution execution = new PlaybookExecution();
        execution.setPlaybookId(playbookId);
        execution.setTriggeredBy(userId);
        execution.setTriggeredByName("analyst1@oouraa");
        execution.setStatus("running");
        
        execution = executionRepository.save(execution);

        playbook.setRunCount(playbook.getRunCount() + 1);
        playbook.setLastRunAt(OffsetDateTime.now());
        playbookRepository.save(playbook);

        executePlaybookStepsAsync(execution.getId(), playbook);
        
        return execution;
    }

    @Async
    public void executePlaybookStepsAsync(UUID executionId, Playbook playbook) {
        log.info("Starting async execution for playbook: {} execution: {}", playbook.getName(), executionId);
        try {
            // Mocking execution logic here
            // In a real scenario, this would parse playbook.getSteps() and execute them
            Thread.sleep(2000); // simulate work
            
            PlaybookExecution execution = executionRepository.findById(executionId).orElseThrow();
            execution.setStatus("completed");
            execution.setCompletedAt(OffsetDateTime.now());
            
            // Mocking a successful step log
            execution.setStepLogs("[{\"step\":\"mock_step\",\"status\":\"success\",\"message\":\"Executed successfully\"}]");
            
            executionRepository.save(execution);
            
            playbook.setSuccessCount(playbook.getSuccessCount() + 1);
            playbookRepository.save(playbook);
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
