package com.netcradus.acis.log.repository;

import com.netcradus.acis.log.model.IngestionError;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface IngestionErrorRepository extends JpaRepository<IngestionError, UUID> {
    List<IngestionError> findByOccurredAtBetween(Instant from, Instant to);

    @Modifying
    @Query("DELETE FROM IngestionError e WHERE e.occurredAt < :cutoff")
    int deleteByOccurredAtBefore(Instant cutoff);
}
