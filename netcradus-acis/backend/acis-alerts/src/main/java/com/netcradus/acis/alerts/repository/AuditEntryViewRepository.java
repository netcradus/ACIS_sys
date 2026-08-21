package com.netcradus.acis.alerts.repository;

import com.netcradus.acis.alerts.model.AuditEntryView;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface AuditEntryViewRepository extends JpaRepository<AuditEntryView, UUID> {
    List<AuditEntryView> findByTenantIdAndResourceOrderByTimestampAsc(UUID tenantId, String resource);
}
