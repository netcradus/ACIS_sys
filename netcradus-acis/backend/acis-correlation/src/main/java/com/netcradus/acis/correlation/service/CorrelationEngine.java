package com.netcradus.acis.correlation.service;

import com.netcradus.acis.common.dto.AlertDto;
import com.netcradus.acis.common.dto.NormalizedEvent;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.correlation.model.CorrelationRule;
import com.netcradus.acis.correlation.repository.CorrelationRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lightweight in-JVM correlation engine (no Apache Flink dependency).
 * Evaluates each incoming event against enabled rules using field/keyword
 * predicates extracted from the rule's SPL-like query, and tracks real
 * sliding-window counts for threshold-style rules ("| where count > N").
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CorrelationEngine {

    private final CorrelationRuleRepository ruleRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    private static final Pattern THRESHOLD_PATTERN =
            Pattern.compile("(?:where\\s+)?count\\s*>\\s*(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern FIELD_VALUE_PATTERN =
            Pattern.compile("(\\w+)\\s*=\\s*\"?([\\w.\\-:]+)\"?");

    private final AtomicLong totalEvents = new AtomicLong(0);
    private final AtomicLong[] buckets = new AtomicLong[8];
    private final Map<String, AtomicLong> ruleMatchCounts = new ConcurrentHashMap<>();
    // ruleId -> groupKey -> timestamps of recent matches, for threshold rules
    private final Map<String, Map<String, Deque<Instant>>> ruleWindows = new ConcurrentHashMap<>();
    // Real per-rule predicate-evaluation timing, accumulated across every event each rule is checked against.
    private final Map<String, AtomicLong> ruleEvalNanosTotal = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> ruleEvalCount = new ConcurrentHashMap<>();
    // tenantId|srcIp -> last time an implicit IOC-hit alert was fired for that pair, so a
    // persistently-beaconing malicious IP doesn't create an alert storm (see maybeTriggerIocAlert).
    private final Map<String, Instant> iocAlertCooldown = new ConcurrentHashMap<>();
    private static final long IOC_ALERT_COOLDOWN_MINUTES = 15;

    {
        for (int i = 0; i < 8; i++) {
            buckets[i] = new AtomicLong(0);
        }
    }

    public long getTotalEvents() {
        return totalEvents.get();
    }

    public int[] getBuckets() {
        int[] res = new int[8];
        for (int i = 0; i < 8; i++) {
            res[i] = (int) buckets[i].get();
        }
        return res;
    }

    public Map<String, Long> getRuleMatchCounts() {
        Map<String, Long> snapshot = new java.util.HashMap<>();
        ruleMatchCounts.forEach((k, v) -> snapshot.put(k, v.get()));
        return snapshot;
    }

    /** Real average predicate-evaluation time per rule, in milliseconds — measured, not estimated. */
    public Map<String, Double> getRuleAvgProcessingMs() {
        Map<String, Double> snapshot = new java.util.HashMap<>();
        ruleEvalNanosTotal.forEach((ruleId, totalNanos) -> {
            long count = ruleEvalCount.getOrDefault(ruleId, new AtomicLong(0)).get();
            if (count > 0) {
                snapshot.put(ruleId, (totalNanos.get() / (double) count) / 1_000_000.0);
            }
        });
        return snapshot;
    }

    @Scheduled(fixedRate = 10000)
    public void rotateBuckets() {
        for (int i = 0; i < 7; i++) {
            buckets[i].set(buckets[i + 1].get());
        }
        buckets[7].set(0);
    }

    @KafkaListener(topics = "acis.raw.events", groupId = "acis-correlation-group")
    public void processEvent(NormalizedEvent event) {
        totalEvents.incrementAndGet();
        buckets[7].incrementAndGet();
        log.debug("Processing event for correlation: {}", event.getEventId());

        // Kafka listener threads have no HTTP request / TenantContextFilter, so
        // the tenant must be taken from the event itself — both to scope which
        // rules run (see below) and so the Row Level Security policy on
        // `correlation_rules` can see the rule.lastRunAt update in triggerAlert().
        try {
            TenantContext.setTenantId(event.getTenantId());

            // A known-bad IP must never be silently ignored just because no
            // analyst has authored a rule that happens to match it yet.
            maybeTriggerIocAlert(event);

            // Only evaluate rules owned by the same tenant as the event — otherwise
            // one tenant's rule definitions would run against every other tenant's
            // events and could tag alerts onto tenants that never authored the rule.
            List<CorrelationRule> activeRules = event.getTenantId() != null
                    ? ruleRepository.findByEnabledTrueAndTenantId(event.getTenantId())
                    : List.of();

            for (CorrelationRule rule : activeRules) {
                long evalStartNanos = System.nanoTime();
                boolean matched = matchesPredicate(rule, event);
                if (matched) {
                    Integer threshold = extractThreshold(rule.getSplQuery());
                    if (threshold == null) {
                        // Simple detection rule: fire immediately on predicate match
                        triggerAlert(rule, event);
                    } else if (crossedThreshold(rule, event, threshold)) {
                        triggerAlert(rule, event);
                    }
                }
                ruleEvalNanosTotal.computeIfAbsent(rule.getId(), k -> new AtomicLong(0))
                        .addAndGet(System.nanoTime() - evalStartNanos);
                ruleEvalCount.computeIfAbsent(rule.getId(), k -> new AtomicLong(0)).incrementAndGet();
            }
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * Extracts field=value / quoted-literal terms from the rule's SPL-like
     * query and checks whether the event's raw text or structured fields
     * contain any of them. This is driven by the rule's actual definition
     * (not a fixed keyword list), so newly-created rules are matched too.
     */
    private boolean matchesPredicate(CorrelationRule rule, NormalizedEvent event) {
        List<String> terms = extractSignalTerms(rule.getSplQuery());
        if (terms.isEmpty()) {
            return false;
        }

        String raw = event.getRaw() != null ? event.getRaw().toLowerCase() : "";
        String user = event.getUser() != null ? event.getUser().toLowerCase() : "";
        String sourceType = event.getSourceType() != null ? event.getSourceType().toLowerCase() : "";
        String action = event.getAction() != null ? event.getAction().toLowerCase() : "";
        // Lets a rule author opt into matching on IOC severity / MITRE technique
        // via an ordinary field="value" predicate, at no extra syntax cost.
        String iocSeverity = event.getIocSeverity() != null ? event.getIocSeverity().toLowerCase() : "";
        String technique = event.getMitreTechnique() != null ? event.getMitreTechnique().toLowerCase() : "";

        for (String term : terms) {
            if (raw.contains(term) || user.contains(term) || sourceType.contains(term) || action.contains(term)
                    || iocSeverity.contains(term) || technique.contains(term)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Guarantees a real threat-intel hit is never silently dropped just
     * because no analyst has yet authored a correlation rule that happens to
     * match it — independent of the authored-rule loop above. Cooldown keyed
     * per tenant+srcIp so a persistently-beaconing malicious IP doesn't
     * create an alert storm. riskScore is deliberately left null: no
     * authored rule backs a number here, and inventing one would be exactly
     * the kind of fabrication AlertDto.anomalyScore's own contract avoids.
     */
    private void maybeTriggerIocAlert(NormalizedEvent event) {
        if (!Boolean.TRUE.equals(event.getIocMatched()) || event.getSrcIp() == null) {
            return;
        }

        String cooldownKey = event.getTenantId() + "|" + event.getSrcIp();
        Instant now = Instant.now();
        Instant lastFired = iocAlertCooldown.get(cooldownKey);
        if (lastFired != null && lastFired.isAfter(now.minusSeconds(IOC_ALERT_COOLDOWN_MINUTES * 60))) {
            return;
        }
        iocAlertCooldown.put(cooldownKey, now);

        log.info("IOC hit! Triggering threat-intel alert for tenant: {} ip: {}", event.getTenantId(), event.getSrcIp());

        AlertDto alert = AlertDto.builder()
                .tenantId(event.getTenantId())
                .title("Known threat indicator matched: " + event.getSrcIp())
                .severity(event.getIocSeverity() != null ? event.getIocSeverity() : "MEDIUM")
                .source("Threat Intelligence")
                .status("OPEN")
                .eventOccurredAt(event.getTimestamp())
                // Real bug found on a live production test: bare LocalDateTime.now()
                // uses the JVM's default zone, which is IST here despite the
                // container OS's own `date` command showing UTC (confirmed via a
                // real MTTD that came back ~5.5h too high - exactly the IST
                // offset). Every other LocalDateTime in this codebase represents
                // UTC wall-clock time (see LogIngestionService's explicit
                // LocalDateTime.ofInstant(ts, ZoneOffset.UTC)) - this now matches
                // that convention instead of silently violating it.
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                .redTeamExecutionId(event.getRedTeamExecutionId())
                .iocMatched(true)
                .iocSeverity(event.getIocSeverity())
                .iocSource(event.getIocSource())
                .mitreTechniques(event.getMitreTechnique() != null ? List.of(event.getMitreTechnique()) : List.of())
                .build();

        kafkaTemplate.send("acis.alerts", alert);
    }

    private List<String> extractSignalTerms(String splQuery) {
        if (splQuery == null || splQuery.isBlank()) {
            return List.of();
        }
        List<String> terms = new java.util.ArrayList<>();
        Matcher m = FIELD_VALUE_PATTERN.matcher(splQuery);
        while (m.find()) {
            String field = m.group(1).toLowerCase();
            String value = m.group(2).toLowerCase();
            // Skip generic SPL scaffolding fields that carry no detection signal
            if (field.equals("index") || field.equals("sourcetype") || field.equals("count")) {
                continue;
            }
            if (value.length() >= 3) {
                terms.add(value);
            }
        }
        return terms;
    }

    /** Exposed for CorrelationController to show a rule's real parsed threshold instead of a hardcoded per-name lookup. */
    public Integer extractThresholdPublic(String splQuery) {
        return extractThreshold(splQuery);
    }

    private Integer extractThreshold(String splQuery) {
        if (splQuery == null) return null;
        Matcher m = THRESHOLD_PATTERN.matcher(splQuery);
        if (m.find()) {
            try {
                return Integer.parseInt(m.group(1));
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private boolean crossedThreshold(CorrelationRule rule, NormalizedEvent event, int threshold) {
        String groupKey = event.getSrcIp() != null ? event.getSrcIp()
                : (event.getUser() != null ? event.getUser() : "GLOBAL");

        Map<String, Deque<Instant>> byKey = ruleWindows.computeIfAbsent(rule.getId(), k -> new ConcurrentHashMap<>());
        Deque<Instant> timestamps = byKey.computeIfAbsent(groupKey, k -> new ArrayDeque<>());

        Instant now = Instant.now();
        Instant windowStart = now.minusSeconds(Math.max(rule.getWindowMinutes(), 1) * 60L);

        synchronized (timestamps) {
            timestamps.addLast(now);
            while (!timestamps.isEmpty() && timestamps.peekFirst().isBefore(windowStart)) {
                timestamps.pollFirst();
            }
            return timestamps.size() > threshold;
        }
    }

    private void triggerAlert(CorrelationRule rule, NormalizedEvent event) {
        log.info("Rule matched! Triggering alert: {} for tenant: {}", rule.getName(), event.getTenantId());

        List<String> techniques = new ArrayList<>();
        if (event.getMitreTechnique() != null) {
            techniques.add(event.getMitreTechnique());
        }

        AlertDto alert = AlertDto.builder()
                .tenantId(event.getTenantId())
                .title("Detection: " + rule.getName())
                .severity(rule.getSeverity())
                .source("Correlation Engine")
                .status("OPEN")
                // Real source-event time this alert was detected from - see
                // NormalizedEvent.timestamp (LogIngestionService). Powers a
                // real MTTD (createdAt - eventOccurredAt), not a fabricated one.
                .eventOccurredAt(event.getTimestamp())
                // Real alert-fired time - previously never set here, so any
                // Kafka consumer of acis.alerts other than AlertConsumer
                // (e.g. RedTeamDetectionConsumer) saw a null timestamp.
                // Real bug found on a live production test: bare LocalDateTime.now()
                // uses the JVM's default zone, which is IST here despite the
                // container OS's own `date` command showing UTC (confirmed via a
                // real MTTD that came back ~5.5h too high - exactly the IST
                // offset). Every other LocalDateTime in this codebase represents
                // UTC wall-clock time (see LogIngestionService's explicit
                // LocalDateTime.ofInstant(ts, ZoneOffset.UTC)) - this now matches
                // that convention instead of silently violating it.
                .createdAt(LocalDateTime.now(ZoneOffset.UTC))
                // Previously computed on the rule but discarded before ever
                // reaching the alert - dead field, now actually used.
                .riskScore(rule.getRiskScore())
                .mitreTechniques(techniques)
                .redTeamExecutionId(event.getRedTeamExecutionId())
                .iocMatched(event.getIocMatched())
                .iocSeverity(event.getIocSeverity())
                .iocSource(event.getIocSource())
                .build();

        kafkaTemplate.send("acis.alerts", alert);

        ruleMatchCounts.computeIfAbsent(rule.getId(), k -> new AtomicLong(0)).incrementAndGet();

        rule.setLastRunAt(LocalDateTime.now());
        ruleRepository.save(rule);
    }
}
