package com.netcradus.acis.soar.integrations.cloudflare;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * Real calls against Cloudflare's REST API — the thing that makes a SOAR
 * "block" step actually block traffic at Cloudflare's edge, for any origin
 * behind it (Vercel, AWS, Azure, DigitalOcean, anything), instead of the
 * simulated "Firewall / Proxy policy rule updated successfully" message
 * PlaybookService used to return unconditionally.
 *
 * Uses Cloudflare's IP Access Rules endpoint — zone-scoped, immediate effect,
 * no cache purge or propagation delay to wait on, which is what a real-time
 * incident-response action needs.
 */
@Slf4j
@Component
public class CloudflareClient {

    private static final String BASE_URL = "https://api.cloudflare.com/client/v4";

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Verifies the token can actually read the given zone. Throws with a human-readable message on failure. */
    public void testConnection(String apiToken, String zoneId) {
        try {
            HttpEntity<Void> request = new HttpEntity<>(authHeaders(apiToken));
            var response = restTemplate.exchange(
                BASE_URL + "/zones/" + zoneId, HttpMethod.GET, request, String.class);
            JsonNode body = objectMapper.readTree(response.getBody());
            if (!body.path("success").asBoolean(false)) {
                throw new CloudflareApiException(extractErrorMessage(body, "Cloudflare rejected the request"));
            }
        } catch (HttpStatusCodeException e) {
            throw new CloudflareApiException(describeHttpError(e));
        } catch (CloudflareApiException e) {
            throw e;
        } catch (Exception e) {
            throw new CloudflareApiException("Could not reach Cloudflare: " + e.getMessage());
        }
    }

    /** Blocks an IP at the Cloudflare edge for the given zone. Throws with a human-readable message on failure. */
    public void blockIp(String apiToken, String zoneId, String ip, String note) {
        try {
            Map<String, Object> body = Map.of(
                "mode", "block",
                "configuration", Map.of("target", "ip", "value", ip),
                "notes", note
            );
            HttpHeaders headers = authHeaders(apiToken);
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

            var response = restTemplate.exchange(
                BASE_URL + "/zones/" + zoneId + "/firewall/access_rules/rules",
                HttpMethod.POST, request, String.class);
            JsonNode responseBody = objectMapper.readTree(response.getBody());
            if (!responseBody.path("success").asBoolean(false)) {
                throw new CloudflareApiException(extractErrorMessage(responseBody, "Cloudflare rejected the block request"));
            }
            log.info("Cloudflare: blocked IP {} on zone {}", ip, zoneId);
        } catch (HttpStatusCodeException e) {
            throw new CloudflareApiException(describeHttpError(e));
        } catch (CloudflareApiException e) {
            throw e;
        } catch (Exception e) {
            throw new CloudflareApiException("Could not reach Cloudflare: " + e.getMessage());
        }
    }

    private HttpHeaders authHeaders(String apiToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + apiToken);
        return headers;
    }

    private String describeHttpError(HttpStatusCodeException e) {
        try {
            JsonNode body = objectMapper.readTree(e.getResponseBodyAsString());
            return extractErrorMessage(body, "Cloudflare returned " + e.getStatusCode());
        } catch (Exception parseFailure) {
            return "Cloudflare returned " + e.getStatusCode() + ": " + e.getStatusText();
        }
    }

    private String extractErrorMessage(JsonNode body, String fallback) {
        JsonNode errors = body.path("errors");
        if (errors.isArray() && errors.size() > 0) {
            JsonNode first = errors.get(0);
            return first.path("message").asText(fallback) + " (code " + first.path("code").asText("?") + ")";
        }
        return fallback;
    }

    public static class CloudflareApiException extends RuntimeException {
        public CloudflareApiException(String message) {
            super(message);
        }
    }
}
