package com.netcradus.acis.ingestion.service;

import com.netcradus.acis.ingestion.model.IngestionError;
import com.netcradus.acis.ingestion.repository.IngestionErrorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/** Records real ingestion failures from this service's own entry points - see acis-log-service's IngestionErrorService for the retention job. */
@Slf4j
@Service
@RequiredArgsConstructor
public class IngestionErrorService {

    private final IngestionErrorRepository repository;

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
}
