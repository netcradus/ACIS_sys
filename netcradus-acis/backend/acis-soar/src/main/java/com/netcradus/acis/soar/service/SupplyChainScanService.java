package com.netcradus.acis.soar.service;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.AlertDto;
import com.netcradus.acis.soar.integrations.osv.ManifestParser;
import com.netcradus.acis.soar.integrations.osv.OsvClient;
import com.netcradus.acis.soar.integrations.secretscan.SecretScanner;
import com.netcradus.acis.soar.model.DependencyFinding;
import com.netcradus.acis.soar.model.SecretFinding;
import com.netcradus.acis.soar.repository.DependencyFindingRepository;
import com.netcradus.acis.soar.repository.SecretFindingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Real supply-chain security: dependency vulnerability scanning against
 * OSV.dev (osv.dev - free, public, no API key) and local pattern-based
 * secrets/credential-exposure scanning. Both operate on manifest/file
 * content the caller submits directly (upload or paste) - there is no
 * GitHub/GitLab repository connector yet (that needs an OAuth App the
 * platform doesn't have credentials for), so this does not walk a remote
 * repo on its own. See SupplyChainController for the two entry points.
 */
@Service
@RequiredArgsConstructor
public class SupplyChainScanService {

    private final OsvClient osvClient;
    private final ManifestParser manifestParser;
    private final SecretScanner secretScanner;
    private final DependencyFindingRepository dependencyFindingRepository;
    private final SecretFindingRepository secretFindingRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final AuditEventPublisher auditEventPublisher;

    public record DependencyScanResult(UUID scanId, int dependenciesChecked, List<DependencyFinding> findings) {}

    public DependencyScanResult scanManifest(String manifestName, String content, UUID tenantId) throws Exception {
        List<OsvClient.DependencyRef> deps = manifestName.toLowerCase().endsWith(".xml")
                ? manifestParser.parsePomXml(content)
                : manifestParser.parsePackageJson(content);

        UUID scanId = UUID.randomUUID();
        Map<OsvClient.DependencyRef, List<String>> matches = osvClient.queryBatch(deps);

        List<DependencyFinding> findings = new java.util.ArrayList<>();
        for (var entry : matches.entrySet()) {
            OsvClient.DependencyRef dep = entry.getKey();
            for (String vulnId : entry.getValue()) {
                OsvClient.Vulnerability vuln = osvClient.fetchDetail(vulnId);
                DependencyFinding finding = new DependencyFinding();
                finding.setTenantId(tenantId);
                finding.setScanId(scanId);
                finding.setEcosystem(dep.ecosystem());
                finding.setPackageName(dep.name());
                finding.setVersion(dep.version());
                finding.setVulnerabilityId(vuln.id());
                finding.setSeverity(vuln.severity());
                finding.setSummary(vuln.summary());
                finding.setFixedVersion(vuln.fixedVersion());
                findings.add(dependencyFindingRepository.save(finding));
            }
        }

        long critical = findings.stream().filter(f -> "CRITICAL".equals(f.getSeverity())).count();
        long high = findings.stream().filter(f -> "HIGH".equals(f.getSeverity())).count();
        if (!findings.isEmpty()) {
            publishDependencyAlert(tenantId, manifestName, findings.size(), critical, high);
        }
        auditEventPublisher.publish("DEPENDENCY_SCAN", "supply-chain/" + scanId,
                "checked=" + deps.size() + " findings=" + findings.size());

        return new DependencyScanResult(scanId, deps.size(), findings);
    }

    public record SecretScanResultDto(UUID scanId, List<SecretFinding> findings) {}

    public SecretScanResultDto scanForSecrets(String sourceName, String content, UUID tenantId) {
        UUID scanId = UUID.randomUUID();
        List<SecretScanner.Match> matches = secretScanner.scan(content);

        List<SecretFinding> findings = new java.util.ArrayList<>();
        for (SecretScanner.Match match : matches) {
            SecretFinding finding = new SecretFinding();
            finding.setTenantId(tenantId);
            finding.setScanId(scanId);
            finding.setSourceName(sourceName);
            finding.setRuleName(match.ruleName());
            finding.setSeverity(match.severity());
            finding.setLineNumber(match.lineNumber());
            finding.setRedactedMatch(match.redactedMatch());
            findings.add(secretFindingRepository.save(finding));
        }

        if (!findings.isEmpty()) {
            publishSecretAlert(tenantId, sourceName, findings);
        }
        auditEventPublisher.publish("SECRET_SCAN", "supply-chain/" + scanId,
                "source=" + sourceName + " findings=" + findings.size());

        return new SecretScanResultDto(scanId, findings);
    }

    public List<DependencyFinding> listDependencyFindings(UUID tenantId) {
        return dependencyFindingRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    public List<SecretFinding> listSecretFindings(UUID tenantId) {
        return secretFindingRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    private void publishDependencyAlert(UUID tenantId, String manifestName, int total, long critical, long high) {
        String severity = critical > 0 ? "CRITICAL" : high > 0 ? "HIGH" : "MEDIUM";
        AlertDto alert = AlertDto.builder()
                .tenantId(tenantId.toString())
                .title("Supply-chain scan of " + manifestName + ": " + total + " known vulnerabilities found")
                .severity(severity)
                .source("Supply-Chain Scanner")
                .status("OPEN")
                .eventOccurredAt(LocalDateTime.now())
                .build();
        kafkaTemplate.send("acis.alerts", alert);
    }

    private void publishSecretAlert(UUID tenantId, String sourceName, List<SecretFinding> findings) {
        boolean anyCritical = findings.stream().anyMatch(f -> "CRITICAL".equals(f.getSeverity()));
        AlertDto alert = AlertDto.builder()
                .tenantId(tenantId.toString())
                .title("Exposed credential(s) detected in " + sourceName + ": " + findings.size() + " finding(s)")
                .severity(anyCritical ? "CRITICAL" : "HIGH")
                .source("Secrets Scanner")
                .status("OPEN")
                .eventOccurredAt(LocalDateTime.now())
                .build();
        kafkaTemplate.send("acis.alerts", alert);
    }
}
