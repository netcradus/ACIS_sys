package com.netcradus.acis.log.repository;

import com.netcradus.acis.log.model.LogDocument;
import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface LogRepository extends ElasticsearchRepository<LogDocument, String> {
    List<LogDocument> findByServiceOrderByTimestampDesc(String service);
    List<LogDocument> findByLevelOrderByTimestampDesc(String level);
    List<LogDocument> findTop100ByOrderByTimestampDesc();

    /** Real per-tenant scoping — see LogController; every log carries a real tenantId set at ingestion. */
    List<LogDocument> findByTenantId(String tenantId);
    List<LogDocument> findTop100ByTenantIdOrderByTimestampDesc(String tenantId);

    /** Real bounded-range query for the Dashboard's Ingest Volume chart — avoids pulling a tenant's entire log history into memory just to bucket a selected time window. */
    List<LogDocument> findByTenantIdAndTimestampBetween(String tenantId, Instant from, Instant to);
}
