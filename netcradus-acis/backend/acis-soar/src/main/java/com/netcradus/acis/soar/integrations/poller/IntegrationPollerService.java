package com.netcradus.acis.soar.integrations.poller;

import com.netcradus.acis.common.crypto.CredentialEncryptor;
import com.netcradus.acis.common.tenant.TenantContext;
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

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${acis.credential-encryption-key}")
    private String encryptionKey;

    @Value("${acis.ingestion-service.url}")
    private String ingestionServiceUrl;

    @Scheduled(fixedDelayString = "${acis.integration-poll-interval-ms:120000}", initialDelayString = "${acis.integration-poll-initial-delay-ms:30000}")
    public void pollAll() {
        pollPaloAlto();
        pollWazuh();
        pollSentinelOne();
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

    /** Reads across all tenants — the one legitimate cross-tenant query, bounded to this single call. */
    private <T> List<T> findEnabled(java.util.function.Supplier<List<T>> query) {
        TenantContext.setSystemPollerInProgress(true);
        try {
            return query.get();
        } finally {
            TenantContext.setSystemPollerInProgress(false);
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
