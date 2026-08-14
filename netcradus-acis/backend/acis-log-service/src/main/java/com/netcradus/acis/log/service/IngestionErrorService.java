package com.netcradus.acis.log.service;

import com.netcradus.acis.log.model.IngestionError;
import com.netcradus.acis.log.repository.IngestionErrorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Records real ingestion-pipeline failures so the Dashboard's "Ingest Volume
 * vs Errors" panel has genuine failure data to chart - see IngestionError.
 * Retains 30 days of real history (matches the real zoom/time-range view),
 * pruned daily.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class IngestionErrorService {

    private static final int RETENTION_DAYS = 30;

    private final IngestionErrorRepository repository;

    /** Best-effort: a failure to record a failure must never break ingestion itself. */
    public void record(String source, String reason) {
        try {
            IngestionError error = new IngestionError();
            error.setSource(source);
            error.setReason(reason != null && reason.length() > 1000 ? reason.substring(0, 1000) : reason);
            repository.save(error);
        } catch (Exception e) {
            log.warn("Failed to record ingestion error (source={}): {}", source, e.getMessage());
        }
    }

    @Scheduled(cron = "0 0 3 * * *")
    public void pruneOldErrors() {
        Instant cutoff = Instant.now().minus(RETENTION_DAYS, ChronoUnit.DAYS);
        int deleted = repository.deleteByOccurredAtBefore(cutoff);
        if (deleted > 0) {
            log.info("Pruned {} ingestion error records older than {} days", deleted, RETENTION_DAYS);
        }
    }
}
