package com.netcradus.acis.alerts.service;

import com.netcradus.acis.common.dto.AlertDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Real production wiring for ai-service's IsolationForest anomaly model
 * (POST /ai/anomaly) — until this, zero Java services called that endpoint
 * (confirmed by grep across the whole backend), so a real trained model sat
 * unused. Called synchronously from AlertService.createAlert with a short
 * timeout so a slow/unreachable ai-service degrades to "no score" rather
 * than stalling alert ingestion — same fail-open posture as every other
 * external dependency in this codebase.
 *
 * The feature vector ai-service's extract_features() reads is built only
 * from data this alert genuinely carries (severity, source, rawEvent text) -
 * bytes_out/failed_logins are left absent (not fabricated as 0-with-meaning;
 * extract_features() already treats missing keys as "no signal", which is
 * the honest representation until an ingestion path exists that captures
 * real volumetric/auth-failure counts per event).
 */
@Slf4j
@Service
public class AnomalyScoringService {

    // Short timeout - this runs synchronously on the Kafka consumer thread that
    // persists every alert, so a slow/unreachable ai-service must not stall alert ingestion.
    private final RestTemplate restTemplate = new RestTemplate(timeoutRequestFactory());

    private static org.springframework.http.client.SimpleClientHttpRequestFactory timeoutRequestFactory() {
        org.springframework.http.client.SimpleClientHttpRequestFactory factory =
                new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        return factory;
    }

    @Value("${acis.ai-service.url}")
    private String aiServiceUrl;

    public record AnomalyResult(Double score, Boolean isAnomaly, String topFeatures) {}

    public Optional<AnomalyResult> score(AlertDto alert) {
        Map<String, Object> event = buildFeatureEvent(alert);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> request = new HttpEntity<>(event, headers);

        long startedAt = System.currentTimeMillis();
        try {
            Map response = restTemplate.postForObject(aiServiceUrl + "/ai/anomaly", request, Map.class);
            if (response == null) {
                return Optional.empty();
            }
            Double score = toDouble(response.get("anomaly_score"));
            Boolean isAnomaly = Boolean.TRUE.equals(response.get("is_anomaly"));
            String topFeatures = joinTopFeatures(response.get("top_features"));
            log.info("ANOMALY_SCORED alertTitle={} score={} isAnomaly={} durationMs={}",
                    alert.getTitle(), score, isAnomaly, System.currentTimeMillis() - startedAt);
            return Optional.of(new AnomalyResult(score, isAnomaly, topFeatures));
        } catch (RestClientException e) {
            log.warn("Anomaly scoring unavailable, leaving alert unscored: {}", e.getMessage());
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Unexpected error during anomaly scoring, leaving alert unscored: {}", e.getMessage());
            return Optional.empty();
        }
    }

    private Map<String, Object> buildFeatureEvent(AlertDto alert) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("action", alert.getSource());
        event.put("severity", alert.getSeverity() != null ? alert.getSeverity().toLowerCase() : null);
        String raw = (alert.getTitle() != null ? alert.getTitle() : "")
                + (alert.getRawEvent() != null ? " " + alert.getRawEvent() : "");
        event.put("raw", raw);
        return event;
    }

    private Double toDouble(Object value) {
        if (value instanceof Number n) {
            return n.doubleValue();
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private String joinTopFeatures(Object value) {
        if (value instanceof List<?> list) {
            return String.join(",", (List<String>) list);
        }
        return null;
    }
}
