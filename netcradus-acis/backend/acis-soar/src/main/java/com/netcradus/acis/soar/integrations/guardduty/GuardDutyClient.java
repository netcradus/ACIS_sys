package com.netcradus.acis.soar.integrations.guardduty;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.guardduty.GuardDutyClientBuilder;
import software.amazon.awssdk.services.guardduty.model.*;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Real calls against AWS GuardDuty, via the AWS SDK (SigV4 request signing
 * handled by the SDK, not hand-rolled). testConnection/fetchFindings each
 * open a short-lived SDK client scoped to the caller's own credentials —
 * GuardDuty findings only exist under a "detector", so both first resolve
 * the tenant's detector id.
 */
@Slf4j
@Component
public class GuardDutyClient {

    /** Verifies the credentials can list detectors in the given region. Throws with a human-readable message on failure. */
    public void testConnection(String accessKeyId, String secretAccessKey, String region) {
        try (software.amazon.awssdk.services.guardduty.GuardDutyClient client = buildClient(accessKeyId, secretAccessKey, region)) {
            client.listDetectors(ListDetectorsRequest.builder().build());
        } catch (SdkException e) {
            throw new GuardDutyApiException(describeError(e));
        }
    }

    /** Fetches findings updated since {@code since}, as generic field maps (the real finding's actual fields). */
    public List<Map<String, Object>> fetchFindings(String accessKeyId, String secretAccessKey, String region, OffsetDateTime since) {
        try (software.amazon.awssdk.services.guardduty.GuardDutyClient client = buildClient(accessKeyId, secretAccessKey, region)) {
            ListDetectorsResponse detectors = client.listDetectors(ListDetectorsRequest.builder().build());
            if (detectors.detectorIds().isEmpty()) {
                return List.of();
            }
            String detectorId = detectors.detectorIds().get(0);

            FindingCriteria criteria = FindingCriteria.builder()
                    .criterion(Map.of("updatedAt", Condition.builder()
                            .greaterThanOrEqual(since.toInstant().toEpochMilli())
                            .build()))
                    .build();

            ListFindingsResponse listed = client.listFindings(ListFindingsRequest.builder()
                    .detectorId(detectorId)
                    .findingCriteria(criteria)
                    .maxResults(50)
                    .build());
            if (listed.findingIds().isEmpty()) {
                return List.of();
            }

            GetFindingsResponse findings = client.getFindings(GetFindingsRequest.builder()
                    .detectorId(detectorId)
                    .findingIds(listed.findingIds())
                    .build());

            List<Map<String, Object>> events = new ArrayList<>();
            for (Finding f : findings.findings()) {
                Map<String, Object> event = new LinkedHashMap<>();
                event.put("source", "guardduty");
                event.put("id", f.id());
                event.put("type", f.type());
                event.put("severity", f.severity());
                event.put("title", f.title());
                event.put("description", f.description());
                event.put("region", f.region());
                event.put("accountId", f.accountId());
                event.put("createdAt", f.createdAt());
                event.put("updatedAt", f.updatedAt());
                if (f.resource() != null) {
                    event.put("resourceType", f.resource().resourceType());
                }
                events.add(event);
            }
            return events;
        } catch (SdkException e) {
            throw new GuardDutyApiException(describeError(e));
        }
    }

    private software.amazon.awssdk.services.guardduty.GuardDutyClient buildClient(String accessKeyId, String secretAccessKey, String region) {
        GuardDutyClientBuilder builder = software.amazon.awssdk.services.guardduty.GuardDutyClient.builder()
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(accessKeyId, secretAccessKey)));
        return builder.build();
    }

    private String describeError(SdkException e) {
        return e.getMessage() != null ? e.getMessage() : "AWS GuardDuty request failed";
    }

    public static class GuardDutyApiException extends RuntimeException {
        public GuardDutyApiException(String message) {
            super(message);
        }
    }
}
