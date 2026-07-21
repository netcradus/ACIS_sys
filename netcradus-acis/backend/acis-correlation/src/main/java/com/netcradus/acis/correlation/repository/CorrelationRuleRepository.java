package com.netcradus.acis.correlation.repository;

import com.netcradus.acis.correlation.model.CorrelationRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface CorrelationRuleRepository extends JpaRepository<CorrelationRule, String> {
    List<CorrelationRule> findByTenantId(String tenantId);
    List<CorrelationRule> findByEnabledTrue();
    List<CorrelationRule> findByEnabledTrueAndTenantId(String tenantId);
    Optional<CorrelationRule> findByIdAndTenantId(String id, String tenantId);
}
