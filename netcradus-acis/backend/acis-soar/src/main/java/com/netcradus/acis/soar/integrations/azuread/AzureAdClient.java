package com.netcradus.acis.soar.integrations.azuread;

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

/** Real calls against Microsoft Graph's /auditLogs/signIns, via the same OAuth2 flow as AzureSentinelClient. */
@Slf4j
@Component
@RequiredArgsConstructor
public class AzureAdClient {

    private static final String SCOPE = "https://graph.microsoft.com/.default";
    private static final String BASE_URL = "https://graph.microsoft.com/v1.0/auditLogs/signIns";

    private final AzureOAuthClient oAuthClient;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Verifies the App Registration can list sign-ins. Throws with a human-readable message on failure. */
    public void testConnection(String azureTenantId, String clientId, String clientSecret) {
        try {
            String token = oAuthClient.getAccessToken(azureTenantId, clientId, clientSecret, SCOPE);
            String url = UriComponentsBuilder.fromHttpUrl(BASE_URL).queryParam("$top", 1).toUriString();
            HttpEntity<Void> request = new HttpEntity<>(authHeaders(token));
            restTemplate.exchange(url, HttpMethod.GET, request, String.class);
        } catch (AzureOAuthClient.AzureAuthException e) {
            throw new AzureAdApiException(e.getMessage());
        } catch (HttpStatusCodeException e) {
            throw new AzureAdApiException(describeError(e));
        } catch (RestClientException e) {
            throw new AzureAdApiException("Could not reach Microsoft Graph: " + e.getMessage());
        }
    }

    /** Fetches sign-ins since {@code since}, as generic field maps (the real sign-in event's actual fields). */
    public List<Map<String, Object>> fetchSignIns(String azureTenantId, String clientId, String clientSecret, OffsetDateTime since) {
        try {
            String token = oAuthClient.getAccessToken(azureTenantId, clientId, clientSecret, SCOPE);
            String filter = "createdDateTime ge " + since.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
            String url = UriComponentsBuilder.fromHttpUrl(BASE_URL)
                    .queryParam("$filter", filter)
                    .queryParam("$top", 50)
                    .toUriString();
            HttpEntity<Void> request = new HttpEntity<>(authHeaders(token));
            var response = restTemplate.exchange(url, HttpMethod.GET, request, String.class);
            JsonNode body = objectMapper.readTree(response.getBody());

            List<Map<String, Object>> events = new ArrayList<>();
            JsonNode value = body.path("value");
            if (value.isArray()) {
                for (JsonNode signIn : value) {
                    Map<String, Object> event = new LinkedHashMap<>();
                    event.put("source", "azure-ad-signin");
                    event.putAll(objectMapper.convertValue(signIn, Map.class));
                    events.add(event);
                }
            }
            return events;
        } catch (AzureOAuthClient.AzureAuthException e) {
            throw new AzureAdApiException(e.getMessage());
        } catch (HttpStatusCodeException e) {
            throw new AzureAdApiException(describeError(e));
        } catch (AzureAdApiException e) {
            throw e;
        } catch (RestClientException e) {
            throw new AzureAdApiException("Could not reach Microsoft Graph: " + e.getMessage());
        } catch (Exception e) {
            throw new AzureAdApiException("Could not parse Microsoft Graph response: " + e.getMessage());
        }
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
            return msg != null ? msg : "Microsoft Graph returned " + e.getStatusCode();
        } catch (Exception parseFailure) {
            return "Microsoft Graph returned " + e.getStatusCode() + ": " + e.getStatusText();
        }
    }

    public static class AzureAdApiException extends RuntimeException {
        public AzureAdApiException(String message) {
            super(message);
        }
    }
}
