package com.netcradus.acis.alerts.repository;

import com.netcradus.acis.alerts.model.Incident;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface IncidentRepository extends JpaRepository<Incident, String> {
    List<Incident> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    Optional<Incident> findByIdAndTenantId(String id, String tenantId);
    long countByTenantId(String tenantId);
}
