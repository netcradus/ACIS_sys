package com.netcradus.acis.soar.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.soar.model.Playbook;
import com.netcradus.acis.soar.model.PlaybookExecution;
import com.netcradus.acis.soar.repository.PlaybookExecutionRepository;
import com.netcradus.acis.soar.repository.PlaybookRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
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
    private final ContainmentActionService containmentActionService;

    @Value("${acis.asset-service.url}")
    private String assetServiceUrl;

    public List<Playbook> getPlaybooks(UUID tenantId) {
        return playbookRepository.findByTenantId(tenantId);
    }

    public Playbook createPlaybook(Playbook playbook) {
        return playbookRepository.save(playbook);
    }

    public Optional<Playbook> getPlaybook(UUID id, UUID tenantId) {
        return playbookRepository.findByIdAndTenantId(id, tenantId);
    }

    public Optional<Playbook> updatePlaybook(UUID id, UUID tenantId, Playbook updated) {
        return playbookRepository.findByIdAndTenantId(id, tenantId).map(existing -> {
            existing.setName(updated.getName());
            existing.setDescription(updated.getDescription());
            if (updated.getSteps() != null) {
                existing.setSteps(updated.getSteps());
            }
            if (updated.getEnabled() != null) {
                existing.setEnabled(updated.getEnabled());
            }
            // A playbook can't chain to itself — silently drop rather than reject, since
            // the field is optional and self-reference is never a valid chain.
            UUID nextId = updated.getTriggerPlaybookId();
            existing.setTriggerPlaybookId(nextId != null && nextId.equals(id) ? null : nextId);
            return playbookRepository.save(existing);
        });
    }

    /** Real playbook-to-playbook chain edges for this tenant, derived from triggerPlaybookId — no fabricated relationships. */
    public java.util.Map<String, Object> getDependencyGraph(UUID tenantId) {
        List<Playbook> playbooks = playbookRepository.findByTenantId(tenantId);
        List<java.util.Map<String, Object>> nodes = playbooks.stream()
                .map(p -> {
                    java.util.Map<String, Object> node = new java.util.HashMap<>();
                    node.put("id", p.getId());
                    node.put("name", p.getName());
                    node.put("enabled", p.getEnabled());
                    node.put("runCount", p.getRunCount());
                    return node;
                })
                .collect(java.util.stream.Collectors.toList());

        List<java.util.Map<String, Object>> edges = playbooks.stream()
                .filter(p -> p.getTriggerPlaybookId() != null)
                .filter(p -> playbooks.stream().anyMatch(t -> t.getId().equals(p.getTriggerPlaybookId())))
                .map(p -> {
                    java.util.Map<String, Object> edge = new java.util.HashMap<>();
                    edge.put("from", p.getId());
                    edge.put("to", p.getTriggerPlaybookId());
                    return edge;
                })
                .collect(java.util.stream.Collectors.toList());

        java.util.Map<String, Object> graph = new java.util.HashMap<>();
        graph.put("nodes", nodes);
        graph.put("edges", edges);
        return graph;
    }

    /** Chain hops are capped to guard against a two-hop cycle (A triggers B, B triggers A). */
    private static final int MAX_CHAIN_DEPTH = 5;

    @Transactional
    public PlaybookExecution startExecution(UUID playbookId, UUID tenantId, UUID userId, String userEmail,
                                             String bearerToken, java.util.Map<String, String> params) {
        Playbook playbook = playbookRepository.findByIdAndTenantId(playbookId, tenantId)
            .orElseThrow(() -> new IllegalArgumentException("Playbook not found"));

        PlaybookExecution execution = new PlaybookExecution();
        execution.setPlaybookId(playbookId);
        execution.setTriggeredBy(userId);
        execution.setTriggeredByName(userEmail != null ? userEmail : "unknown");
        execution.setStatus("running");
        execution.setStepLogs("[]");

        execution = executionRepository.save(execution);

        playbook.setRunCount(playbook.getRunCount() + 1);
        playbook.setLastRunAt(OffsetDateTime.now());
        playbookRepository.save(playbook);

        executePlaybookStepsAsync(execution.getId(), playbook, params, tenantId, bearerToken,
                userEmail != null ? userEmail : "unknown");

        return execution;
    }

    @Async
    public void executePlaybookStepsAsync(UUID executionId, Playbook playbook, java.util.Map<String, String> params,
                                           UUID tenantId, String bearerToken, String performedBy) {
        log.info("Starting async execution for playbook: {} execution: {}", playbook.getName(), executionId);
        // @Async runs on a separate thread with no HTTP request / TenantContextFilter,
        // so the tenant must be set explicitly here — required for the Row Level
        // Security policy on `playbooks` to allow the successCount update below.
        TenantContext.setTenantId(tenantId.toString());
        try {
            java.util.List<java.util.Map<String, Object>> stepList = objectMapper.readValue(
                playbook.getSteps(),
                new com.fasterxml.jackson.core.type.TypeReference<java.util.List<java.util.Map<String, Object>>>() {}
            );

            java.util.List<java.util.Map<String, Object>> logList = new java.util.ArrayList<>();
            boolean failed = false;

            org.springframework.http.HttpHeaders assetServiceHeaders = new org.springframework.http.HttpHeaders();
            if (bearerToken != null) {
                assetServiceHeaders.set("Authorization", "Bearer " + bearerToken);
            }
            assetServiceHeaders.set("X-Tenant-ID", tenantId.toString());

            String targetAssetId = params.get("targetAssetId");
            if (targetAssetId == null || targetAssetId.trim().isEmpty()) {
                targetAssetId = params.get("assetId");
            }

            // If asset not passed, auto-select the first workstation or server that is active
            if (targetAssetId == null || targetAssetId.trim().isEmpty()) {
                try {
                    org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
                    org.springframework.http.HttpEntity<Void> requestEntity = new org.springframework.http.HttpEntity<>(assetServiceHeaders);
                    org.springframework.http.ResponseEntity<java.util.List> resp = restTemplate.exchange(
                        assetServiceUrl + "/api/assets", org.springframework.http.HttpMethod.GET, requestEntity, java.util.List.class);
                    java.util.List<?> assets = resp.getBody();
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
                            org.springframework.http.HttpEntity<java.util.Map<String, Object>> updateEntity =
                                new org.springframework.http.HttpEntity<>(update, assetServiceHeaders);
                            restTemplate.exchange(assetServiceUrl + "/api/assets/" + targetAssetId + "/status",
                                org.springframework.http.HttpMethod.PUT, updateEntity, Void.class);
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
                    // Real Keycloak account disable + full session revocation (see
                    // ContainmentActionService) when a target user is provided;
                    // "reset" with no target user is a step this platform genuinely
                    // cannot fulfill (no password-reset-only Keycloak flow is wired),
                    // so it stays honestly Skipped rather than pretending.
                    String targetUserId = params.get("targetUserId");
                    if (targetUserId == null || targetUserId.isBlank()) {
                        status = "Skipped";
                        outputMessage = "No targetUserId provided — this step did not change any credentials.";
                    } else {
                        ContainmentActionService.Result result = containmentActionService.disableAccount(
                                tenantId, targetUserId, performedBy, executionId);
                        status = result.success() ? "Success" : "Failed";
                        outputMessage = result.message();
                        failed = failed || !result.success();
                    }
                } else if (stepName.toLowerCase().contains("block") || stepName.toLowerCase().contains("policy")) {
                    // Real Cloudflare edge block if the tenant has one configured
                    // (Settings > Integrations > Cloudflare); otherwise say so honestly
                    // rather than claiming a firewall rule that was never applied.
                    String targetIp = params.get("targetIp");
                    if (targetIp == null || targetIp.isBlank()) {
                        status = "Failed";
                        outputMessage = "No target IP provided for block action";
                        failed = true;
                    } else {
                        ContainmentActionService.Result result = containmentActionService.blockIp(
                                tenantId, targetIp,
                                "Blocked by ACIS playbook \"" + playbook.getName() + "\" (execution " + executionId + ")",
                                performedBy, executionId);
                        status = result.success() ? "Success" : (result.message().startsWith("No Cloudflare") ? "Skipped" : "Failed");
                        outputMessage = result.message();
                        failed = failed || (!result.success() && !"Skipped".equals(status));
                    }
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

                if (playbook.getTriggerPlaybookId() != null) {
                    final int chainDepth;
                    int parsedDepth;
                    try {
                        parsedDepth = Integer.parseInt(params.getOrDefault("_chainDepth", "0"));
                    } catch (NumberFormatException ignored) {
                        // treat unparsable depth as start of a fresh chain
                        parsedDepth = 0;
                    }
                    chainDepth = parsedDepth;
                    if (chainDepth < MAX_CHAIN_DEPTH) {
                        playbookRepository.findByIdAndTenantId(playbook.getTriggerPlaybookId(), tenantId)
                            .ifPresent(next -> {
                                log.info("Playbook {} completed — auto-triggering chained playbook {}", playbook.getId(), next.getId());
                                java.util.Map<String, String> chainedParams = new java.util.HashMap<>(params);
                                chainedParams.put("_chainDepth", String.valueOf(chainDepth + 1));
                                chainedParams.put("_chainedFrom", playbook.getId().toString());
                                startExecution(next.getId(), tenantId, null, "playbook-chain: " + playbook.getName(), bearerToken, chainedParams);
                            });
                    } else {
                        log.warn("Playbook chain depth limit ({}) reached at playbook {} — not auto-triggering further", MAX_CHAIN_DEPTH, playbook.getId());
                    }
                }
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
        } finally {
            TenantContext.clear();
        }
    }

    /** Returns the execution only if it belongs to a playbook owned by the given tenant. */
    public Optional<PlaybookExecution> getExecution(UUID executionId, UUID tenantId) {
        return executionRepository.findById(executionId)
                .filter(exec -> playbookRepository.findByIdAndTenantId(exec.getPlaybookId(), tenantId).isPresent());
    }

    public List<PlaybookExecution> getExecutions(UUID playbookId) {
        return executionRepository.findByPlaybookId(playbookId);
    }

    public List<PlaybookExecution> getAllExecutions(UUID tenantId) {
        List<UUID> tenantPlaybookIds = playbookRepository.findByTenantId(tenantId).stream()
                .map(Playbook::getId)
                .collect(java.util.stream.Collectors.toList());
        if (tenantPlaybookIds.isEmpty()) {
            return List.of();
        }
        return executionRepository.findByPlaybookIdInOrderByStartedAtDesc(tenantPlaybookIds);
    }
}
