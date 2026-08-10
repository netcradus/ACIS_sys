package com.netcradus.acis.log.service;

import org.springframework.stereotype.Service;

import java.lang.management.ManagementFactory;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Real ingest-pipeline telemetry for the Dashboard's system-health panel —
 * replaces what used to be a Math.random()-based synthetic history and a
 * hardcoded CPU constant on the frontend (DashboardPage.tsx's
 * "Closed-Loop Simulator" tab).
 *
 * Lag is the genuine gap between a log's ingest-receipt timestamp
 * (LogDocument.timestamp, set by acis-ingestion/Splunk-HEC at the moment the
 * event first arrived) and the moment this service's Kafka consumer finishes
 * processing it (LogIngestionService.consume(), after enrichment) — the real
 * end-to-end latency of this pipeline, not a fabricated number. Mirrors
 * acis-correlation's CorrelationEngine rolling-window pattern.
 */
@Service
public class IngestMetricsService {

    private static final int WINDOW_SIZE = 20;

    private final Deque<Long> lagSamplesMs = new ArrayDeque<>(WINDOW_SIZE);
    private final ReentrantLock lock = new ReentrantLock();

    // com.sun.management is a standard part of the HotSpot JDK (what this
    // service actually runs on, per the Dockerfile's eclipse-temurin base) —
    // gives real process CPU load with zero extra dependencies, unlike
    // wiring up Micrometer/Actuator's metrics endpoint through the gateway.
    private final com.sun.management.OperatingSystemMXBean osBean =
            (com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();

    public void recordLag(Instant eventTimestamp) {
        if (eventTimestamp == null) return;
        long lagMs = Math.max(0, Duration.between(eventTimestamp, Instant.now()).toMillis());
        lock.lock();
        try {
            if (lagSamplesMs.size() >= WINDOW_SIZE) {
                lagSamplesMs.removeFirst();
            }
            lagSamplesMs.addLast(lagMs);
        } finally {
            lock.unlock();
        }
    }

    public List<Long> getLagSeries() {
        lock.lock();
        try {
            return List.copyOf(lagSamplesMs);
        } finally {
            lock.unlock();
        }
    }

    /** Real process CPU load for this JVM (0-100), rounded to one decimal. -1 (no reading available yet) maps to 0 rather than a negative/misleading value. */
    public double getCpuUsagePercent() {
        double load = osBean.getProcessCpuLoad();
        if (load < 0) return 0;
        return Math.round(load * 1000) / 10.0;
    }
}
