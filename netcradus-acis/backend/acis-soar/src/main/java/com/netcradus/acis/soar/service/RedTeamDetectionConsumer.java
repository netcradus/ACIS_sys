package com.netcradus.acis.soar.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.netcradus.acis.common.dto.AlertDto;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.soar.model.RedTeamExecution;
import com.netcradus.acis.soar.repository.RedTeamExecutionRepository;
import com.netcradus.acis.soar.repository.RedTeamSimulationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Closes the Red Team detection-validation loop: a second, independent
 * consumer group on the same acis.alerts topic AlertConsumer already
 * listens on (a standard, safe Kafka pattern — see
 * AlertKafkaConsumerConfig's Javadoc for why this needs its own container
 * factory). Watches for alerts tagged with a redTeamExecutionId (set by
 * CorrelationEngine when the triggering NormalizedEvent originated from a
 * red-team synthetic log — see RedTeamService.stageMetadata /
 * LogIngestionService) and records a real detection against the owning
 * execution, replacing the frontend's previous fabricated "steps logged"
 * indicator with a genuine "did our own detection engine actually catch
 * this" signal.
 *
 * Same single-instance/low-concurrency read-modify-write tradeoff
 * AuditEventConsumer's hash-chain already documents and accepts elsewhere in
 * this codebase — would need a DB-level lock (SELECT ... FOR UPDATE) to stay
 * correct if acis-soar is ever horizontally scaled with concurrency > 1.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RedTeamDetectionConsumer {

    private final RedTeamExecutionRepository executionRepository;
    private final RedTeamSimulationRepository simulationRepository;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "acis.alerts", groupId = "acis-soar-redteam-detection-group",
            containerFactory = "alertDtoKafkaListenerContainerFactory")
    public void consume(AlertDto alertDto) {
        if (alertDto.getRedTeamExecutionId() == null) {
            return; // not a red-team-triggered alert — the overwhelming majority of traffic on this topic
        }

        UUID executionId;
        try {
            executionId = UUID.fromString(alertDto.getRedTeamExecutionId());
        } catch (IllegalArgumentException e) {
            log.warn("Malformed redTeamExecutionId on alert {}: {}", alertDto.getId(), alertDto.getRedTeamExecutionId());
            return;
        }

        if (alertDto.getTenantId() == null) {
            log.warn("Alert {} carries a redTeamExecutionId but no tenantId — dropping", alertDto.getId());
            return;
        }

        // red_team_executions itself has no RLS (child-of-tenant-owned-parent
        // — see RlsConfig), but red_team_simulations does, so TenantContext is
        // needed for the ownership lookup below even though it's not needed
        // for the execution write itself.
        try {
            TenantContext.setTenantId(alertDto.getTenantId());

            RedTeamExecution execution = executionRepository.findById(executionId).orElse(null);
            if (execution == null) {
                log.debug("No red-team execution found for id {} (alert {})", executionId, alertDto.getId());
                return;
            }

            UUID tenantId;
            try {
                tenantId = UUID.fromString(alertDto.getTenantId());
            } catch (IllegalArgumentException e) {
                log.warn("Malformed tenantId on alert {}: {}", alertDto.getId(), alertDto.getTenantId());
                return;
            }

            boolean ownedByTenant = simulationRepository.findByIdAndTenantId(execution.getSimulationId(), tenantId).isPresent();
            if (!ownedByTenant) {
                log.warn("Alert {} claims redTeamExecutionId {} but tenant {} doesn't own the owning simulation — dropping",
                        alertDto.getId(), executionId, tenantId);
                return;
            }

            recordDetection(execution, alertDto);
        } finally {
            TenantContext.clear();
        }
    }

    private void recordDetection(RedTeamExecution execution, AlertDto alertDto) {
        List<String> techniques = alertDto.getMitreTechniques();
        List<String> effectiveTechniques = (techniques == null || techniques.isEmpty())
                ? java.util.Collections.singletonList(null)
                : techniques;

        ArrayNode logs;
        try {
            JsonNode existing = execution.getDetectionLogs() != null
                    ? objectMapper.readTree(execution.getDetectionLogs())
                    : objectMapper.createArrayNode();
            logs = existing.isArray() ? (ArrayNode) existing : objectMapper.createArrayNode();
        } catch (Exception e) {
            log.warn("Failed to parse existing detectionLogs for execution {}, starting fresh: {}", execution.getId(), e.getMessage());
            logs = objectMapper.createArrayNode();
        }

        OffsetDateTime detectedAt = alertDto.getCreatedAt() != null
                ? alertDto.getCreatedAt().atOffset(java.time.ZoneOffset.UTC)
                : OffsetDateTime.now();
        Long mttdSecondsForThisDetection = null;
        if (alertDto.getEventOccurredAt() != null && alertDto.getCreatedAt() != null) {
            mttdSecondsForThisDetection = Duration.between(alertDto.getEventOccurredAt(), alertDto.getCreatedAt()).getSeconds();
        }

        for (String technique : effectiveTechniques) {
            ObjectNode entry = objectMapper.createObjectNode();
            entry.put("technique", technique);
            entry.put("alertId", alertDto.getId());
            entry.put("alertTitle", alertDto.getTitle());
            entry.put("severity", alertDto.getSeverity());
            entry.put("detectedAt", detectedAt.toString());
            if (mttdSecondsForThisDetection != null) {
                entry.put("mttdSeconds", mttdSecondsForThisDetection);
            }
            logs.add(entry);
        }

        try {
            execution.setDetectionLogs(objectMapper.writeValueAsString(logs));
        } catch (Exception e) {
            log.warn("Failed to serialize detectionLogs for execution {}: {}", execution.getId(), e.getMessage());
            return;
        }

        // Distinct techniques with at least one real detection — never a raw
        // alert count, so a re-firing threshold rule can't inflate coverage.
        Set<String> distinctDetected = new HashSet<>();
        for (JsonNode entry : logs) {
            JsonNode t = entry.get("technique");
            if (t != null && !t.isNull()) {
                distinctDetected.add(t.asText());
            }
        }
        execution.setDetectedTechniqueCount(distinctDetected.size());

        if (execution.getFirstDetectedAt() == null) {
            execution.setFirstDetectedAt(detectedAt);
            if (execution.getStartedAt() != null) {
                execution.setMttdSeconds(ChronoUnit.SECONDS.between(execution.getStartedAt(), detectedAt));
            }
        }

        executionRepository.save(execution);
        log.info("Recorded real detection for red-team execution {}: alert={} techniques={}",
                execution.getId(), alertDto.getId(), effectiveTechniques);
    }
}
