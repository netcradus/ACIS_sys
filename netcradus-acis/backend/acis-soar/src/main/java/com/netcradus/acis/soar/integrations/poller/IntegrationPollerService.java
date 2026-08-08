package com.netcradus.acis.soar.integrations.poller;

import com.netcradus.acis.common.crypto.CredentialEncryptor;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.soar.integrations.azuread.AzureAdClient;
import com.netcradus.acis.soar.integrations.azuread.AzureAdIntegration;
import com.netcradus.acis.soar.integrations.azuread.AzureAdIntegrationRepository;
import com.netcradus.acis.soar.integrations.azuresentinel.AzureSentinelClient;
import com.netcradus.acis.soar.integrations.azuresentinel.AzureSentinelIntegration;
import com.netcradus.acis.soar.integrations.azuresentinel.AzureSentinelIntegrationRepository;
import com.netcradus.acis.soar.integrations.guardduty.GuardDutyClient;
import com.netcradus.acis.soar.integrations.guardduty.GuardDutyIntegration;
import com.netcradus.acis.soar.integrations.guardduty.GuardDutyIntegrationRepository;
import com.netcradus.acis.soar.integrations.paloalto.PaloAltoClient;
import com.netcradus.acis.soar.integrations.paloalto.PaloAltoIntegration;
import com.netcradus.acis.soar.integrations.paloalto.PaloAltoIntegrationRepository;
import com.netcradus.acis.soar.integrations.sentinelone.SentinelOneClient;
import com.netcradus.acis.soar.integrations.sentinelone.SentinelOneIntegration;
import com.netcradus.acis.soar.integrations.sentinelone.SentinelOneIntegrationRepository;
import com.netcradus.acis.soar.integrations.wazuh.WazuhClient;
import com.netcradus.acis.soar.integrations.wazuh.WazuhIntegration;
import com.netcradus.acis.soar.integrations.wazuh.WazuhIntegrationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * Pulls real events from every tenant's configured Palo Alto / Wazuh /
 * SentinelOne integration on a fixed schedule and forwards them through the
 * same /api/ingest/external/json endpoint external customers use — so
 * fetched events go through exactly the same, already-proven ingestion path
 * (tenant tagging, Kafka, log-service, Elasticsearch) rather than a separate
 * shortcut. An integration with no vendor account behind it simply never
 * appears in the findByEnabledTrue() lists below and is never polled — there
 * is no simulated/fake data generated when nothing is configured.
 *
 * Runs single-threaded and sequentially per tenant/vendor; one tenant's
 * slow or failing vendor call cannot block another's, since each integration
 * is wrapped in its own try/catch that records the failure on that
 * integration's own row and moves on.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class IntegrationPollerService {

    private final PaloAltoIntegrationRepository paloAltoRepository;
    private final PaloAltoClient paloAltoClient;
    private final WazuhIntegrationRepository wazuhRepository;
    private final WazuhClient wazuhClient;
    private final SentinelOneIntegrationRepository sentinelOneRepository;
    private final SentinelOneClient sentinelOneClient;
    private final GuardDutyIntegrationRepository guardDutyRepository;
    private final GuardDutyClient guardDutyClient;
    private final AzureSentinelIntegrationRepository azureSentinelRepository;
    private final AzureSentinelClient azureSentinelClient;
    private final AzureAdIntegrationRepository azureAdRepository;
    private final AzureAdClient azureAdClient;

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${acis.credential-encryption-key}")
    private String encryptionKey;

    @Value("${acis.ingestion-service.url}")
    private String ingestionServiceUrl;

    @Value("${acis.threat-service.url}")
    private String threatServiceUrl;

    @Value("${acis.internal-service-key}")
    private String internalServiceKey;

    @Scheduled(fixedDelayString = "${acis.integration-poll-interval-ms:120000}", initialDelayString = "${acis.integration-poll-initial-delay-ms:30000}")
    public void pollAll() {
        pollPaloAlto();
        pollWazuh();
        pollSentinelOne();
        pollGuardDuty();
        pollAzureSentinel();
        pollAzureAd();
    }

    private void pollPaloAlto() {
        List<PaloAltoIntegration> integrations = findEnabled(paloAltoRepository::findByEnabledTrue);
        for (PaloAltoIntegration integ : integrations) {
            TenantContext.setTenantId(integ.getTenantId().toString());
            try {
                OffsetDateTime since = integ.getLastPolledAt() != null ? integ.getLastPolledAt() : OffsetDateTime.now().minusHours(1);
                String hostname = integ.getHostname();
                String apiKey = CredentialEncryptor.decrypt(integ.getApiKeyEncrypted(), encryptionKey);
                List<Map<String, Object>> events = paloAltoClient.fetchTrafficLogs(hostname, apiKey, since);
                forwardAndRecord(events, integ.getSystemApiKeyEncrypted(), integ.getTenantId());
                integ.setLastPollStatus("Success");
                integ.setLastPollError(null);
            } catch (Exception e) {
                log.warn("Palo Alto poll failed for tenant {}: {}", integ.getTenantId(), e.getMessage());
                integ.setLastPollStatus("Failed");
                integ.setLastPollError(e.getMessage());
            } finally {
                integ.setLastPolledAt(OffsetDateTime.now());
                paloAltoRepository.save(integ);
                TenantContext.clear();
            }
        }
    }

    private void pollWazuh() {
        List<WazuhIntegration> integrations = findEnabled(wazuhRepository::findByEnabledTrue);
        for (WazuhIntegration integ : integrations) {
            TenantContext.setTenantId(integ.getTenantId().toString());
            try {
                OffsetDateTime since = integ.getLastPolledAt() != null ? integ.getLastPolledAt() : OffsetDateTime.now().minusHours(1);
                String password = CredentialEncryptor.decrypt(integ.getPasswordEncrypted(), encryptionKey);
                List<Map<String, Object>> events = wazuhClient.fetchAlerts(
                        integ.getBaseUrl(), integ.getUsername(), password, integ.getIndexPattern(), since);
                forwardAndRecord(events, integ.getSystemApiKeyEncrypted(), integ.getTenantId());
                integ.setLastPollStatus("Success");
                integ.setLastPollError(null);
            } catch (Exception e) {
                log.warn("Wazuh poll failed for tenant {}: {}", integ.getTenantId(), e.getMessage());
                integ.setLastPollStatus("Failed");
                integ.setLastPollError(e.getMessage());
            } finally {
                integ.setLastPolledAt(OffsetDateTime.now());
                wazuhRepository.save(integ);
                TenantContext.clear();
            }
        }
    }

    private void pollSentinelOne() {
        List<SentinelOneIntegration> integrations = findEnabled(sentinelOneRepository::findByEnabledTrue);
        for (SentinelOneIntegration integ : integrations) {
            TenantContext.setTenantId(integ.getTenantId().toString());
            try {
                OffsetDateTime since = integ.getLastPolledAt() != null ? integ.getLastPolledAt() : OffsetDateTime.now().minusHours(1);
                String apiToken = CredentialEncryptor.decrypt(integ.getApiTokenEncrypted(), encryptionKey);
                List<Map<String, Object>> events = sentinelOneClient.fetchThreats(integ.getConsoleUrl(), apiToken, since);
                forwardAndRecord(events, integ.getSystemApiKeyEncrypted(), integ.getTenantId());
                integ.setLastPollStatus("Success");
                integ.setLastPollError(null);
            } catch (Exception e) {
                log.warn("SentinelOne poll failed for tenant {}: {}", integ.getTenantId(), e.getMessage());
                integ.setLastPollStatus("Failed");
                integ.setLastPollError(e.getMessage());
            } finally {
                integ.setLastPolledAt(OffsetDateTime.now());
                sentinelOneRepository.save(integ);
                TenantContext.clear();
            }
        }
    }

    private void pollGuardDuty() {
        List<GuardDutyIntegration> integrations = findEnabled(guardDutyRepository::findByEnabledTrue);
        for (GuardDutyIntegration integ : integrations) {
            TenantContext.setTenantId(integ.getTenantId().toString());
            try {
                OffsetDateTime since = integ.getLastPolledAt() != null ? integ.getLastPolledAt() : OffsetDateTime.now().minusHours(1);
                String accessKeyId = CredentialEncryptor.decrypt(integ.getAccessKeyIdEncrypted(), encryptionKey);
                String secretAccessKey = CredentialEncryptor.decrypt(integ.getSecretAccessKeyEncrypted(), encryptionKey);
                List<Map<String, Object>> events = guardDutyClient.fetchFindings(accessKeyId, secretAccessKey, integ.getRegion(), since);
                forwardAndRecord(events, integ.getSystemApiKeyEncrypted(), integ.getTenantId());
                forwardGuardDutyIndicators(events, integ.getTenantId());
                integ.setLastPollStatus("Success");
                integ.setLastPollError(null);
            } catch (Exception e) {
                log.warn("AWS GuardDuty poll failed for tenant {}: {}", integ.getTenantId(), e.getMessage());
                integ.setLastPollStatus("Failed");
                integ.setLastPollError(e.getMessage());
            } finally {
                integ.setLastPolledAt(OffsetDateTime.now());
                guardDutyRepository.save(integ);
                TenantContext.clear();
            }
        }
    }

    private void pollAzureSentinel() {
        List<AzureSentinelIntegration> integrations = findEnabled(azureSentinelRepository::findByEnabledTrue);
        for (AzureSentinelIntegration integ : integrations) {
            TenantContext.setTenantId(integ.getTenantId().toString());
            try {
                OffsetDateTime since = integ.getLastPolledAt() != null ? integ.getLastPolledAt() : OffsetDateTime.now().minusHours(1);
                String clientSecret = CredentialEncryptor.decrypt(integ.getClientSecretEncrypted(), encryptionKey);
                List<Map<String, Object>> events = azureSentinelClient.fetchIncidents(
                        integ.getAzureTenantId(), integ.getClientId(), clientSecret,
                        integ.getSubscriptionId(), integ.getResourceGroup(), integ.getWorkspaceName(), since);
                forwardAndRecord(events, integ.getSystemApiKeyEncrypted(), integ.getTenantId());
                integ.setLastPollStatus("Success");
                integ.setLastPollError(null);
            } catch (Exception e) {
                log.warn("Azure Sentinel poll failed for tenant {}: {}", integ.getTenantId(), e.getMessage());
                integ.setLastPollStatus("Failed");
                integ.setLastPollError(e.getMessage());
            } finally {
                integ.setLastPolledAt(OffsetDateTime.now());
                azureSentinelRepository.save(integ);
                TenantContext.clear();
            }
        }
    }

    private void pollAzureAd() {
        List<AzureAdIntegration> integrations = findEnabled(azureAdRepository::findByEnabledTrue);
        for (AzureAdIntegration integ : integrations) {
            TenantContext.setTenantId(integ.getTenantId().toString());
            try {
                OffsetDateTime since = integ.getLastPolledAt() != null ? integ.getLastPolledAt() : OffsetDateTime.now().minusHours(1);
                String clientSecret = CredentialEncryptor.decrypt(integ.getClientSecretEncrypted(), encryptionKey);
                List<Map<String, Object>> events = azureAdClient.fetchSignIns(integ.getAzureTenantId(), integ.getClientId(), clientSecret, since);
                forwardAndRecord(events, integ.getSystemApiKeyEncrypted(), integ.getTenantId());
                forwardAzureAdIndicators(events, integ.getTenantId());
                integ.setLastPollStatus("Success");
                integ.setLastPollError(null);
            } catch (Exception e) {
                log.warn("Azure AD poll failed for tenant {}: {}", integ.getTenantId(), e.getMessage());
                integ.setLastPollStatus("Failed");
                integ.setLastPollError(e.getMessage());
            } finally {
                integ.setLastPolledAt(OffsetDateTime.now());
                azureAdRepository.save(integ);
                TenantContext.clear();
            }
        }
    }

    /** Reads across all tenants — the one legitimate cross-tenant query, bounded to this single call. */
    private <T> List<T> findEnabled(java.util.function.Supplier<List<T>> query) {
        TenantContext.setSystemPollerInProgress(true);
        try {
            return query.get();
        } finally {
            TenantContext.setSystemPollerInProgress(false);
        }
    }

    /**
     * Bridges real GuardDuty findings that carry an extracted remote IP/
     * domain (see GuardDutyClient.extractIndicator) into acis-threat-service's
     * threat_indicators table — closing the gap where real findings only
     * ever flowed into the Alerts pipeline via /api/ingest/external/json,
     * never appearing in the Threat Intelligence indicator list. AWS's own
     * three-band severity scale (Low 0.1-3.9 / Medium 4.0-6.9 / High
     * 7.0-8.9) is preserved rather than stretched into a fabricated
     * CRITICAL band GuardDuty itself never assigns.
     */
    private void forwardGuardDutyIndicators(List<Map<String, Object>> events, java.util.UUID tenantId) {
        List<Map<String, Object>> indicators = new java.util.ArrayList<>();
        for (Map<String, Object> event : events) {
            Object value = event.get("iocValue");
            Object type = event.get("iocType");
            if (value == null || type == null) continue;

            double severityScore = 0;
            Object severityObj = event.get("severity");
            if (severityObj instanceof Number n) severityScore = n.doubleValue();
            String severity = severityScore >= 7 ? "HIGH" : severityScore >= 4 ? "MEDIUM" : "LOW";

            Map<String, Object> indicator = new java.util.LinkedHashMap<>();
            indicator.put("value", value);
            indicator.put("type", type);
            indicator.put("severity", severity);
            indicator.put("description", event.get("title") != null ? event.get("title") : event.get("description"));
            indicator.put("source", "AWS GuardDuty");
            indicators.add(indicator);
        }
        forwardIndicators(indicators, tenantId);
    }

    /**
     * Bridges real Azure AD risky/failed sign-ins into the Threat
     * Intelligence indicator list — only sign-ins Microsoft Graph itself
     * flagged (a non-"none" riskLevelAggregated) or that failed outright
     * (a non-zero status.errorCode) are forwarded, so a normal successful
     * sign-in from a real ipAddress is never fabricated into a threat.
     */
    @SuppressWarnings("unchecked")
    private void forwardAzureAdIndicators(List<Map<String, Object>> events, java.util.UUID tenantId) {
        List<Map<String, Object>> indicators = new java.util.ArrayList<>();
        for (Map<String, Object> event : events) {
            Object ip = event.get("ipAddress");
            if (ip == null || String.valueOf(ip).isBlank()) continue;

            String riskLevel = String.valueOf(event.getOrDefault("riskLevelAggregated", "none"));
            boolean risky = riskLevel != null && !riskLevel.equalsIgnoreCase("none") && !riskLevel.equalsIgnoreCase("null");

            long errorCode = 0;
            Object statusObj = event.get("status");
            if (statusObj instanceof Map<?, ?> status && status.get("errorCode") instanceof Number n) {
                errorCode = n.longValue();
            }
            boolean failed = errorCode != 0;
            if (!risky && !failed) continue;

            String severity = riskLevel.equalsIgnoreCase("high") ? "HIGH" : riskLevel.equalsIgnoreCase("medium") ? "MEDIUM" : "LOW";
            String userPrincipal = String.valueOf(event.getOrDefault("userPrincipalName", "unknown user"));

            Map<String, Object> indicator = new java.util.LinkedHashMap<>();
            indicator.put("value", ip);
            indicator.put("type", "IP");
            indicator.put("severity", severity);
            indicator.put("description", (failed ? "Failed" : "Risky") + " Azure AD sign-in from " + userPrincipal
                    + (failed ? " (error " + errorCode + ")" : " (risk: " + riskLevel + ")"));
            indicator.put("source", "Azure AD");
            indicators.add(indicator);
        }
        forwardIndicators(indicators, tenantId);
    }

    private void forwardIndicators(List<Map<String, Object>> indicators, java.util.UUID tenantId) {
        if (indicators.isEmpty()) return;
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Tenant-ID", tenantId.toString());
        headers.set("X-Internal-Service-Key", internalServiceKey);
        HttpEntity<List<Map<String, Object>>> request = new HttpEntity<>(indicators, headers);
        try {
            restTemplate.postForEntity(threatServiceUrl + "/api/threat-intel/indicators/bulk", request, String.class);
            log.info("Forwarded {} real indicators for tenant {}", indicators.size(), tenantId);
        } catch (RestClientException e) {
            log.warn("Could not forward indicators to threat-service for tenant {}: {}", tenantId, e.getMessage());
        }
    }

    private void forwardAndRecord(List<Map<String, Object>> events, String systemApiKeyEncrypted, java.util.UUID tenantId) {
        if (events.isEmpty() || systemApiKeyEncrypted == null) {
            return;
        }
        String systemApiKey = CredentialEncryptor.decrypt(systemApiKeyEncrypted, encryptionKey);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-API-Key", systemApiKey);
        HttpEntity<List<Map<String, Object>>> request = new HttpEntity<>(events, headers);
        try {
            restTemplate.postForEntity(ingestionServiceUrl + "/api/ingest/external/json", request, String.class);
            log.info("Forwarded {} events for tenant {}", events.size(), tenantId);
        } catch (RestClientException e) {
            throw new IllegalStateException("Fetched " + events.size() + " events but could not forward them to ingestion: " + e.getMessage(), e);
        }
    }
}
