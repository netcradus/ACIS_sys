package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.AuditEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AuditEntryRepository extends JpaRepository<AuditEntry, UUID> {
    List<AuditEntry> findByTenantIdOrderByTimestampDesc(UUID tenantId);
    List<AuditEntry> findAllByOrderByTimestampDesc();
}
