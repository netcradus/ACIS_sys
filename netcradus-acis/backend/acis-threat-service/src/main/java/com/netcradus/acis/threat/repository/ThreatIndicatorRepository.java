package com.netcradus.acis.threat.repository;

import com.netcradus.acis.threat.model.ThreatIndicator;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ThreatIndicatorRepository extends JpaRepository<ThreatIndicator, String> {
    Optional<ThreatIndicator> findByValue(String value);
    List<ThreatIndicator> findByTenantId(String tenantId);
    Optional<ThreatIndicator> findByValueAndTenantId(String value, String tenantId);
}
