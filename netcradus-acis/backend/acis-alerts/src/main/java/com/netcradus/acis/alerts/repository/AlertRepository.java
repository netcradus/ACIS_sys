package com.netcradus.acis.alerts.repository;

import com.netcradus.acis.alerts.model.Alert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface AlertRepository extends JpaRepository<Alert, String> {
    List<Alert> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    List<Alert> findByStatusOrderByCreatedAtDesc(String status);
}
