package com.netcradus.acis.platformadmin.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface PlatformAuditRepository extends JpaRepository<PlatformAuditEvent, UUID>,
        JpaSpecificationExecutor<PlatformAuditEvent> {

    List<PlatformAuditEvent> findAllByOrderByTimestampDesc();

    Page<PlatformAuditEvent> findAllByOrderByTimestampDesc(Pageable pageable);

    /** Chain tail - the entry the next real audit event's prevHash must match. */
    java.util.Optional<PlatformAuditEvent> findTopByOrderByTimestampDesc();

    /** Oldest-first walk of the real global chain, for verification. */
    List<PlatformAuditEvent> findAllByOrderByTimestampAsc();
}