package com.netcradus.acis.ingestion.repository;

import com.netcradus.acis.ingestion.model.IngestionError;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface IngestionErrorRepository extends JpaRepository<IngestionError, UUID> {
}
