package com.netcradus.acis.soar.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * Real OAuth2 client-credentials token exchange against the Microsoft
 * identity platform — shared by AzureSentinelClient and AzureAdClient, since
 * both authenticate the same way (an Azure AD App Registration's Tenant ID /
 * Client ID / Client Secret), just against different resource scopes
 * (management.azure.com for Sentinel, graph.microsoft.com for sign-in logs).
 */
@Component
public class AzureOAuthClient {

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public String getAccessToken(String azureTenantId, String clientId, String clientSecret, String scope) {
        String url = "https://login.microsoftonline.com/" + azureTenantId + "/oauth2/v2.0/token";
        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("client_id", clientId);
        body.add("client_secret", clientSecret);
        body.add("scope", scope);
        body.add("grant_type", "client_credentials");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(body, headers);

        try {
            String responseBody = restTemplate.postForObject(url, request, String.class);
            JsonNode json = objectMapper.readTree(responseBody);
            String token = json.path("access_token").asText(null);
            if (token == null) {
                throw new AzureAuthException("Azure did not return an access token");
            }
            return token;
        } catch (HttpStatusCodeException e) {
            throw new AzureAuthException(describeError(e));
        } catch (AzureAuthException e) {
            throw e;
        } catch (RestClientException e) {
            throw new AzureAuthException("Could not reach Microsoft identity platform: " + e.getMessage());
        } catch (Exception e) {
            throw new AzureAuthException("Could not parse Microsoft identity platform response: " + e.getMessage());
        }
    }

    private String describeError(HttpStatusCodeException e) {
        try {
            JsonNode body = objectMapper.readTree(e.getResponseBodyAsString());
            String desc = body.path("error_description").asText(null);
            return desc != null ? desc : "Azure token request returned " + e.getStatusCode();
        } catch (Exception parseFailure) {
            return "Azure token request returned " + e.getStatusCode() + ": " + e.getStatusText();
        }
    }

    public static class AzureAuthException extends RuntimeException {
        public AzureAuthException(String message) {
            super(message);
        }
    }
}
