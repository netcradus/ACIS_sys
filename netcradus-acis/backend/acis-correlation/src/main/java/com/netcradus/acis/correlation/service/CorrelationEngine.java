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
import java.util.ArrayDeque;
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

            // Only evaluate rules owned by the same tenant as the event — otherwise
            // one tenant's rule definitions would run against every other tenant's
            // events and could tag alerts onto tenants that never authored the rule.
            List<CorrelationRule> activeRules = event.getTenantId() != null
                    ? ruleRepository.findByEnabledTrueAndTenantId(event.getTenantId())
                    : List.of();

            for (CorrelationRule rule : activeRules) {
                if (matchesPredicate(rule, event)) {
                    Integer threshold = extractThreshold(rule.getSplQuery());
                    if (threshold == null) {
                        // Simple detection rule: fire immediately on predicate match
                        triggerAlert(rule, event);
                    } else if (crossedThreshold(rule, event, threshold)) {
                        triggerAlert(rule, event);
                    }
                }
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

        for (String term : terms) {
            if (raw.contains(term) || user.contains(term) || sourceType.contains(term) || action.contains(term)) {
                return true;
            }
        }
        return false;
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

        AlertDto alert = AlertDto.builder()
                .tenantId(event.getTenantId())
                .title("Detection: " + rule.getName())
                .severity(rule.getSeverity())
                .source("Correlation Engine")
                .status("OPEN")
                .build();

        kafkaTemplate.send("acis.alerts", alert);

        ruleMatchCounts.computeIfAbsent(rule.getId(), k -> new AtomicLong(0)).incrementAndGet();

        rule.setLastRunAt(LocalDateTime.now());
        ruleRepository.save(rule);
    }
}
