package com.netcradus.acis.alerts.repository;

import com.netcradus.acis.alerts.model.Alert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
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
}
