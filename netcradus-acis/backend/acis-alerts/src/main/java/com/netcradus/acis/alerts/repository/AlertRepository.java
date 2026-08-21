package com.netcradus.acis.alerts.repository;

import com.netcradus.acis.alerts.model.Alert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface AlertRepository extends JpaRepository<Alert, String> {
    List<Alert> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    List<Alert> findByStatusOrderByCreatedAtDesc(String status);
    Optional<Alert> findByIdAndTenantId(String id, String tenantId);
    List<Alert> findAllByTenantId(String tenantId);

    /** Cross-tenant read for the real ML retraining pipeline — caller must bypass RLS via TenantContext.setSystemPollerInProgress(true), same pattern as AssetDriftDetectionService. */
    List<Alert> findByConfirmedCategoryIsNotNull();

    /** Real per-severity counts for the Quick Summary/Workflow charts — replaces naive in-memory stream counting. */
    @Query("SELECT a.severity, COUNT(a) FROM Alert a WHERE a.tenantId = :tenantId GROUP BY a.severity")
    List<Object[]> countBySeverity(@Param("tenantId") String tenantId);

    @Query("SELECT a.status, COUNT(a) FROM Alert a WHERE a.tenantId = :tenantId GROUP BY a.status")
    List<Object[]> countByStatus(@Param("tenantId") String tenantId);

    @Query("SELECT a.source, COUNT(a) FROM Alert a WHERE a.tenantId = :tenantId GROUP BY a.source")
    List<Object[]> countBySource(@Param("tenantId") String tenantId);

    /** Real distinct values actually present in this tenant's data — never a hardcoded list, since real status values (e.g. DISMISSED) go beyond the 4 documented on Alert.status. */
    @Query("SELECT DISTINCT a.source FROM Alert a WHERE a.tenantId = :tenantId AND a.source IS NOT NULL ORDER BY a.source")
    List<String> findDistinctSources(@Param("tenantId") String tenantId);

    @Query("SELECT DISTINCT a.status FROM Alert a WHERE a.tenantId = :tenantId ORDER BY a.status")
    List<String> findDistinctStatuses(@Param("tenantId") String tenantId);

    @Query("SELECT DISTINCT a.ownerId FROM Alert a WHERE a.tenantId = :tenantId AND a.ownerId IS NOT NULL ORDER BY a.ownerId")
    List<String> findDistinctOwnerIds(@Param("tenantId") String tenantId);

    /** Real bounded-range query for the Severity Trend chart — avoids pulling a tenant's entire alert history into memory just to bucket a selected time window. */
    List<Alert> findByTenantIdAndCreatedAtBetween(String tenantId, LocalDateTime from, LocalDateTime to);
}
