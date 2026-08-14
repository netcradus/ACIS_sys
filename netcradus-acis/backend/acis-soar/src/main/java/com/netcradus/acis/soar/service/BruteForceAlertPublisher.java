package com.netcradus.acis.soar.service;

import com.netcradus.acis.common.dto.AlertDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.keycloak.admin.client.Keycloak;
import org.keycloak.representations.idm.EventRepresentation;
import org.keycloak.representations.idm.UserRepresentation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Real Keycloak brute-force lockouts already exist (bruteForceProtected in
 * the realm config, verified live via UserSecurityService) but were only
 * ever visible on-demand, per-user, to a platform-admin operator who thought
 * to look — invisible to the actual SIEM/correlation/alerting pipeline this
 * product exists to run. This polls Keycloak's real realm-wide event log for
 * genuine account lockouts (error=user_temporarily_disabled, the exact error
 * Keycloak's brute-force detector raises) and publishes each one as a real
 * Alert through the same acis.alerts topic CorrelationEngine uses, so a
 * credential-stuffing run against any tenant shows up in Alerts/Correlation
 * like any other real detection - not a separate, easy-to-forget surface.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BruteForceAlertPublisher {

    private final Keycloak keycloakAdminClient;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${acis.keycloak.realm}")
    private String realmName;

    // Single-instance in-memory watermark, same tradeoff already accepted by
    // the gateway's rate limiter - fine until this service is horizontally
    // scaled, at which point it (like the limiter) would need a shared store.
    private final AtomicLong lastPolledEpochMs = new AtomicLong(0);

    @Scheduled(fixedDelayString = "${acis.brute-force-poll-interval-ms:120000}", initialDelayString = "${acis.brute-force-poll-initial-delay-ms:30000}")
    public void pollLockouts() {
        long now = System.currentTimeMillis();
        long since = lastPolledEpochMs.get();
        // First run: only look back 10 minutes, not "the dawn of time" -
        // avoids replaying a realm's entire lockout history as fresh alerts
        // the moment this feature ships.
        long from = since == 0 ? now - 600_000L : since;

        try {
            // Same 8-arg overload UserSecurityService.getLoginEvents already
            // uses successfully - dateFrom/dateTo take yyyy-MM-dd strings in
            // this API, too coarse for a 2-minute poll window, so date
            // filtering is done in Java below against the real event
            // timestamp (epoch millis) instead.
            List<EventRepresentation> events = keycloakAdminClient.realm(realmName)
                    .getEvents(List.of("LOGIN_ERROR"), null, null, null, null, null, 0, 200);

            // Keycloak logs a real user_temporarily_disabled event for EVERY
            // attempt made while already locked, not just the one that
            // triggered the lockout - dedupe per userId within this single
            // poll so one real lockout incident becomes one real alert, not
            // one per retried attempt.
            java.util.Set<String> alertedThisPoll = new java.util.HashSet<>();
            for (EventRepresentation event : events) {
                if (event.getTime() < from) {
                    continue;
                }
                if (!"user_temporarily_disabled".equals(event.getError())) {
                    continue;
                }
                if (event.getUserId() == null || !alertedThisPoll.add(event.getUserId())) {
                    continue;
                }
                publishLockoutAlert(event);
            }
            lastPolledEpochMs.set(now);
        } catch (Exception e) {
            // Never let a Keycloak hiccup take down the scheduler thread -
            // same non-fatal, log-and-continue posture every other real
            // poller in this codebase already uses.
            log.warn("Brute-force event poll failed: {}", e.getMessage());
        }
    }

    private void publishLockoutAlert(EventRepresentation event) {
        String userId = event.getUserId();
        if (userId == null) return;

        String tenantId;
        String username;
        try {
            // GET /users/{id} does NOT populate attributes in this Keycloak
            // version (confirmed live - always came back null, silently
            // dropping every real lockout) — only the search/list endpoint
            // does. So: resolve the username from the by-ID call (that part
            // works), then re-fetch via searchByUsername(..., exact=true)
            // for a representation that actually carries tenant_id.
            UserRepresentation byId = keycloakAdminClient.realm(realmName).users().get(userId).toRepresentation();
            username = byId.getUsername();
            List<UserRepresentation> searchResult = keycloakAdminClient.realm(realmName)
                    .users().searchByUsername(username, true);
            UserRepresentation user = searchResult.isEmpty() ? byId : searchResult.get(0);
            tenantId = firstAttr(user, "tenant_id");
        } catch (Exception e) {
            log.warn("Could not resolve locked-out user {}: {}", userId, e.getMessage());
            return;
        }
        if (tenantId == null) {
            // No real tenant to attribute this to (e.g. a platform-admin
            // account) - never guess one.
            return;
        }

        LocalDateTime occurredAt = event.getTime() > 0
                ? LocalDateTime.ofInstant(Instant.ofEpochMilli(event.getTime()), ZoneOffset.UTC)
                : LocalDateTime.now(ZoneOffset.UTC);

        AlertDto alert = AlertDto.builder()
                .tenantId(tenantId)
                .title("Account locked after repeated failed logins: " + (username != null ? username : userId))
                .severity("HIGH")
                .source("Keycloak Brute-Force Protection")
                .status("OPEN")
                .eventOccurredAt(occurredAt)
                .build();

        kafkaTemplate.send("acis.alerts", alert);
        log.info("BRUTE_FORCE_LOCKOUT_ALERTED tenant={} user={} ip={}", tenantId, username, event.getIpAddress());
    }

    private String firstAttr(UserRepresentation user, String key) {
        if (user.getAttributes() == null) return null;
        List<String> values = user.getAttributes().get(key);
        return values != null && !values.isEmpty() ? values.get(0) : null;
    }
}
