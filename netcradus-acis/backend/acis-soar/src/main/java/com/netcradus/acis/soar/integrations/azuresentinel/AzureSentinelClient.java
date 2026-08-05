package com.netcradus.acis.soar.integrations.azuresentinel;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.soar.support.AzureOAuthClient;
import lombok.RequiredArgsConstructor;
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
 * Real calls against Azure Sentinel's REST API (Microsoft.SecurityInsights),
 * layered on Azure AD's client-credentials OAuth2 flow via AzureOAuthClient.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AzureSentinelClient {

    private static final String SCOPE = "https://management.azure.com/.default";
    private static final String API_VERSION = "2023-02-01";

    private final AzureOAuthClient oAuthClient;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Verifies the App Registration can list incidents in the given workspace. Throws with a human-readable message on failure. */
    public void testConnection(String azureTenantId, String clientId, String clientSecret,
                                String subscriptionId, String resourceGroup, String workspaceName) {
        try {
            String token = oAuthClient.getAccessToken(azureTenantId, clientId, clientSecret, SCOPE);
            String url = incidentsUrl(subscriptionId, resourceGroup, workspaceName) + "&$top=1";
            HttpEntity<Void> request = new HttpEntity<>(authHeaders(token));
            restTemplate.exchange(url, HttpMethod.GET, request, String.class);
        } catch (AzureOAuthClient.AzureAuthException e) {
            throw new AzureSentinelApiException(e.getMessage());
        } catch (HttpStatusCodeException e) {
            throw new AzureSentinelApiException(describeError(e));
        } catch (RestClientException e) {
            throw new AzureSentinelApiException("Could not reach Azure Sentinel: " + e.getMessage());
        }
    }

    /** Fetches incidents created since {@code since}, as generic field maps (the real incident's actual properties). */
    public List<Map<String, Object>> fetchIncidents(String azureTenantId, String clientId, String clientSecret,
                                                       String subscriptionId, String resourceGroup, String workspaceName,
                                                       OffsetDateTime since) {
        try {
            String token = oAuthClient.getAccessToken(azureTenantId, clientId, clientSecret, SCOPE);
            String filter = "properties/createdTimeUtc ge " + since.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
            String url = UriComponentsBuilder.fromHttpUrl(incidentsUrl(subscriptionId, resourceGroup, workspaceName))
                    .queryParam("$filter", filter)
                    .queryParam("$top", 50)
                    .toUriString();
            HttpEntity<Void> request = new HttpEntity<>(authHeaders(token));
            var response = restTemplate.exchange(url, HttpMethod.GET, request, String.class);
            JsonNode body = objectMapper.readTree(response.getBody());

            List<Map<String, Object>> events = new ArrayList<>();
            JsonNode value = body.path("value");
            if (value.isArray()) {
                for (JsonNode incident : value) {
                    Map<String, Object> event = new LinkedHashMap<>();
                    event.put("source", "azure-sentinel");
                    event.put("id", incident.path("name").asText(null));
                    event.putAll(objectMapper.convertValue(incident.path("properties"), Map.class));
                    events.add(event);
                }
            }
            return events;
        } catch (AzureOAuthClient.AzureAuthException e) {
            throw new AzureSentinelApiException(e.getMessage());
        } catch (HttpStatusCodeException e) {
            throw new AzureSentinelApiException(describeError(e));
        } catch (AzureSentinelApiException e) {
            throw e;
        } catch (RestClientException e) {
            throw new AzureSentinelApiException("Could not reach Azure Sentinel: " + e.getMessage());
        } catch (Exception e) {
            throw new AzureSentinelApiException("Could not parse Azure Sentinel response: " + e.getMessage());
        }
    }

    private String incidentsUrl(String subscriptionId, String resourceGroup, String workspaceName) {
        return "https://management.azure.com/subscriptions/" + subscriptionId
                + "/resourceGroups/" + resourceGroup
                + "/providers/Microsoft.OperationalInsights/workspaces/" + workspaceName
                + "/providers/Microsoft.SecurityInsights/incidents?api-version=" + API_VERSION;
    }

    private HttpHeaders authHeaders(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return headers;
    }

    private String describeError(HttpStatusCodeException e) {
        try {
            JsonNode body = objectMapper.readTree(e.getResponseBodyAsString());
            String msg = body.path("error").path("message").asText(null);
            return msg != null ? msg : "Azure Sentinel returned " + e.getStatusCode();
        } catch (Exception parseFailure) {
            return "Azure Sentinel returned " + e.getStatusCode() + ": " + e.getStatusText();
        }
    }

    public static class AzureSentinelApiException extends RuntimeException {
        public AzureSentinelApiException(String message) {
            super(message);
        }
    }
}
