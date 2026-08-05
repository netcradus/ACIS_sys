package com.netcradus.acis.soar.integrations.sentinelone;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Real calls against SentinelOne's Management API (v2.1). consoleUrl is the
 * tenant's own SentinelOne console — SentinelOne is multi-region SaaS, so
 * every customer's base URL is different (e.g. usea1-partners.sentinelone.net).
 */
@Slf4j
@Component
public class SentinelOneClient {

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Verifies the token against /accounts — deliberately not /system/status,
     * which SentinelOne serves unauthenticated as a public health check and
     * returns 200 for literally any token (confirmed against a real console:
     * a garbage token still gets {"data":{"health":"ok"}}). /accounts requires
     * a genuinely valid token and 401s otherwise, so this actually verifies
     * the credential instead of always reporting success.
     */
    public void testConnection(String consoleUrl, String apiToken) {
        try {
            HttpEntity<Void> request = new HttpEntity<>(authHeaders(apiToken));
            var response = restTemplate.exchange(
                    trimTrailingSlash(consoleUrl) + "/web/api/v2.1/accounts?limit=1",
                    HttpMethod.GET, request, String.class);
            JsonNode body = objectMapper.readTree(response.getBody());
            if (body.path("data").isMissingNode()) {
                throw new SentinelOneApiException("Unexpected response from SentinelOne — is this really a SentinelOne console URL?");
            }
        } catch (HttpStatusCodeException e) {
            throw new SentinelOneApiException(describeHttpError(e));
        } catch (SentinelOneApiException e) {
            throw e;
        } catch (RestClientException e) {
            throw new SentinelOneApiException("Could not reach SentinelOne: " + e.getMessage());
        } catch (Exception e) {
            throw new SentinelOneApiException("Could not parse SentinelOne response: " + e.getMessage());
        }
    }

    /**
     * Fetches threats created since {@code since}, as generic field maps
     * (the threat object's real fields — no fixed field list assumed).
     */
    public List<Map<String, Object>> fetchThreats(String consoleUrl, String apiToken, OffsetDateTime since) {
        try {
            String url = UriComponentsBuilder.fromHttpUrl(trimTrailingSlash(consoleUrl) + "/web/api/v2.1/threats")
                    .queryParam("createdAt__gt", since.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME))
                    .queryParam("limit", "200")
                    .queryParam("sortBy", "createdAt")
                    .queryParam("sortOrder", "asc")
                    .toUriString();
            HttpEntity<Void> request = new HttpEntity<>(authHeaders(apiToken));
            var response = restTemplate.exchange(url, HttpMethod.GET, request, String.class);
            JsonNode body = objectMapper.readTree(response.getBody());

            List<Map<String, Object>> events = new ArrayList<>();
            JsonNode data = body.path("data");
            if (data.isArray()) {
                for (JsonNode threat : data) {
                    Map<String, Object> event = new LinkedHashMap<>();
                    event.put("source", "sentinelone");
                    event.putAll(objectMapper.convertValue(threat, Map.class));
                    events.add(event);
                }
            }
            return events;
        } catch (HttpStatusCodeException e) {
            throw new SentinelOneApiException(describeHttpError(e));
        } catch (SentinelOneApiException e) {
            throw e;
        } catch (RestClientException e) {
            throw new SentinelOneApiException("Could not reach SentinelOne: " + e.getMessage());
        } catch (Exception e) {
            throw new SentinelOneApiException("Could not parse SentinelOne response: " + e.getMessage());
        }
    }

    private HttpHeaders authHeaders(String apiToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "ApiToken " + apiToken);
        return headers;
    }

    private String trimTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    private String describeHttpError(HttpStatusCodeException e) {
        try {
            JsonNode body = objectMapper.readTree(e.getResponseBodyAsString());
            JsonNode errors = body.path("errors");
            if (errors.isArray() && errors.size() > 0) {
                return errors.get(0).path("detail").asText("SentinelOne returned " + e.getStatusCode());
            }
            return "SentinelOne returned " + e.getStatusCode();
        } catch (Exception parseFailure) {
            return "SentinelOne returned " + e.getStatusCode() + ": " + e.getStatusText();
        }
    }

    public static class SentinelOneApiException extends RuntimeException {
        public SentinelOneApiException(String message) {
            super(message);
        }
    }
}
