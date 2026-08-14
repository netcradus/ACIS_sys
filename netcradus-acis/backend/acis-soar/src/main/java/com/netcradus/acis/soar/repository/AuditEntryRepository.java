package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.AuditEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AuditEntryRepository extends JpaRepository<AuditEntry, UUID> {
    List<AuditEntry> findByTenantIdOrderByTimestampDesc(UUID tenantId);
    List<AuditEntry> findAllByOrderByTimestampDesc();

    /** Chain tail for a tenant - the entry the next real audit event's prevHash must match. */
    Optional<AuditEntry> findTopByTenantIdOrderByTimestampDesc(UUID tenantId);

    /** Oldest-first walk of a tenant's real chain, for verification. */
    List<AuditEntry> findByTenantIdOrderByTimestampAsc(UUID tenantId);
}
