package com.netcradus.acis.soar.integrations.wazuh;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Real calls against a Wazuh Indexer's OpenSearch-compatible REST API — the
 * component that actually holds Wazuh's alert data (as opposed to the
 * Wazuh Manager API, which manages agents/active-response). Uses standard
 * TLS certificate validation, same rationale as PaloAltoClient: the indexer
 * must present a certificate the JVM trusts (Wazuh ships with a self-signed
 * one by default, which the customer needs to replace or have the JVM
 * truststore extended for — this deliberately does not disable verification).
 */
@Slf4j
@Component
public class WazuhClient {

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Verifies the credentials can reach the indexer's cluster health endpoint. Throws with a human-readable message on failure. */
    public void testConnection(String baseUrl, String username, String password) {
        try {
            HttpEntity<Void> request = new HttpEntity<>(authHeaders(username, password));
            var response = restTemplate.exchange(
                    trimTrailingSlash(baseUrl) + "/_cluster/health", HttpMethod.GET, request, String.class);
            JsonNode body = objectMapper.readTree(response.getBody());
            if (body.path("status").isMissingNode()) {
                throw new WazuhApiException("Unexpected response from Wazuh Indexer — is this really an OpenSearch/Wazuh Indexer endpoint?");
            }
        } catch (HttpStatusCodeException e) {
            throw new WazuhApiException(describeHttpError(e));
        } catch (WazuhApiException e) {
            throw e;
        } catch (RestClientException e) {
            throw new WazuhApiException("Could not reach Wazuh Indexer: " + e.getMessage());
        } catch (Exception e) {
            throw new WazuhApiException("Could not parse Wazuh Indexer response: " + e.getMessage());
        }
    }

    /**
     * Fetches alert documents indexed since {@code since}, as generic field
     * maps (the alert's real _source document — no fixed field list assumed).
     */
    public List<Map<String, Object>> fetchAlerts(String baseUrl, String username, String password,
                                                   String indexPattern, OffsetDateTime since) {
        try {
            Map<String, Object> query = Map.of(
                    "size", 200,
                    "sort", List.of(Map.of("timestamp", "asc")),
                    "query", Map.of("range", Map.of("timestamp", Map.of("gt", since.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME))))
            );
            HttpHeaders headers = authHeaders(username, password);
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> request = new HttpEntity<>(query, headers);

            var response = restTemplate.exchange(
                    trimTrailingSlash(baseUrl) + "/" + indexPattern + "/_search",
                    HttpMethod.POST, request, String.class);
            JsonNode body = objectMapper.readTree(response.getBody());

            List<Map<String, Object>> events = new ArrayList<>();
            JsonNode hits = body.path("hits").path("hits");
            if (hits.isArray()) {
                for (JsonNode hit : hits) {
                    JsonNode source = hit.path("_source");
                    Map<String, Object> event = new LinkedHashMap<>();
                    event.put("source", "wazuh");
                    event.putAll(objectMapper.convertValue(source, Map.class));
                    events.add(event);
                }
            }
            return events;
        } catch (HttpStatusCodeException e) {
            throw new WazuhApiException(describeHttpError(e));
        } catch (WazuhApiException e) {
            throw e;
        } catch (RestClientException e) {
            throw new WazuhApiException("Could not reach Wazuh Indexer: " + e.getMessage());
        } catch (Exception e) {
            throw new WazuhApiException("Could not parse Wazuh Indexer response: " + e.getMessage());
        }
    }

    private HttpHeaders authHeaders(String username, String password) {
        HttpHeaders headers = new HttpHeaders();
        String creds = username + ":" + password;
        headers.set("Authorization", "Basic " + Base64.getEncoder().encodeToString(creds.getBytes(StandardCharsets.UTF_8)));
        return headers;
    }

    private String trimTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    private String describeHttpError(HttpStatusCodeException e) {
        try {
            JsonNode body = objectMapper.readTree(e.getResponseBodyAsString());
            String reason = body.path("error").path("reason").asText(null);
            if (reason != null) return reason + " (" + e.getStatusCode() + ")";
            return "Wazuh Indexer returned " + e.getStatusCode();
        } catch (Exception parseFailure) {
            return "Wazuh Indexer returned " + e.getStatusCode() + ": " + e.getStatusText();
        }
    }

    public static class WazuhApiException extends RuntimeException {
        public WazuhApiException(String message) {
            super(message);
        }
    }
}
