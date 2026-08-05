package com.netcradus.acis.soar.integrations.guardduty;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GuardDutyIntegrationRepository extends JpaRepository<GuardDutyIntegration, UUID> {
    Optional<GuardDutyIntegration> findByTenantId(UUID tenantId);
    void deleteByTenantId(UUID tenantId);

    /** Used only by IntegrationPollerService, under the system-poller RLS bypass. */
    List<GuardDutyIntegration> findByEnabledTrue();
}
