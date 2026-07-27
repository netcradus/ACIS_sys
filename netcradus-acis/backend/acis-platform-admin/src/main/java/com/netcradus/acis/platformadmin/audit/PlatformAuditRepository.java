package com.netcradus.acis.platformadmin.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface PlatformAuditRepository extends JpaRepository<PlatformAuditEvent, UUID> {

    @Query("""
            SELECT e FROM PlatformAuditEvent e
            WHERE (:startDate IS NULL OR e.timestamp >= :startDate)
              AND (:endDate IS NULL OR e.timestamp <= :endDate)
              AND (:tenantId IS NULL OR e.tenantId = :tenantId)
              AND (:adminUserId IS NULL OR e.adminUserId = :adminUserId)
              AND (:targetUserId IS NULL OR e.targetUserId = :targetUserId)
              AND (:action IS NULL OR e.action = :action)
              AND (:status IS NULL OR e.status = :status)
              AND (:search IS NULL
                   OR LOWER(e.adminUsername) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR LOWER(e.targetUsername) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR LOWER(e.tenantName) LIKE LOWER(CONCAT('%', :search, '%')))
            ORDER BY e.timestamp DESC
            """)
    Page<PlatformAuditEvent> search(
            @Param("startDate") OffsetDateTime startDate,
            @Param("endDate") OffsetDateTime endDate,
            @Param("tenantId") String tenantId,
            @Param("adminUserId") String adminUserId,
            @Param("targetUserId") String targetUserId,
            @Param("action") AuditAction action,
            @Param("status") AuditStatus status,
            @Param("search") String search,
            Pageable pageable);

    @Query("""
            SELECT e FROM PlatformAuditEvent e
            WHERE (:startDate IS NULL OR e.timestamp >= :startDate)
              AND (:endDate IS NULL OR e.timestamp <= :endDate)
              AND (:tenantId IS NULL OR e.tenantId = :tenantId)
              AND (:adminUserId IS NULL OR e.adminUserId = :adminUserId)
              AND (:targetUserId IS NULL OR e.targetUserId = :targetUserId)
              AND (:action IS NULL OR e.action = :action)
              AND (:status IS NULL OR e.status = :status)
              AND (:search IS NULL
                   OR LOWER(e.adminUsername) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR LOWER(e.targetUsername) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR LOWER(e.tenantName) LIKE LOWER(CONCAT('%', :search, '%')))
            ORDER BY e.timestamp DESC
            """)
    List<PlatformAuditEvent> searchForExport(
            @Param("startDate") OffsetDateTime startDate,
            @Param("endDate") OffsetDateTime endDate,
            @Param("tenantId") String tenantId,
            @Param("adminUserId") String adminUserId,
            @Param("targetUserId") String targetUserId,
            @Param("action") AuditAction action,
            @Param("status") AuditStatus status,
            @Param("search") String search);
}
