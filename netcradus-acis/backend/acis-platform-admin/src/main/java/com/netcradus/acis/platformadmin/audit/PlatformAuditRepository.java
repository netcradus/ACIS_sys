package com.netcradus.acis.platformadmin.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface PlatformAuditRepository extends JpaRepository<PlatformAuditEvent, UUID> {

    List<PlatformAuditEvent> findAllByOrderByTimestampDesc();

    Page<PlatformAuditEvent> findAllByOrderByTimestampDesc(Pageable pageable);
}