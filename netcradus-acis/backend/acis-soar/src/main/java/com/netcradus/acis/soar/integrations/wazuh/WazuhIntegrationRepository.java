package com.netcradus.acis.soar.integrations.wazuh;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WazuhIntegrationRepository extends JpaRepository<WazuhIntegration, UUID> {
    Optional<WazuhIntegration> findByTenantId(UUID tenantId);
    void deleteByTenantId(UUID tenantId);

    /** Used only by IntegrationPollerService, under the system-poller RLS bypass. */
    List<WazuhIntegration> findByEnabledTrue();
}
