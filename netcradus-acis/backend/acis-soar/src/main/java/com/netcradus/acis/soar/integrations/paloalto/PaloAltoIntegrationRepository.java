package com.netcradus.acis.soar.integrations.paloalto;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaloAltoIntegrationRepository extends JpaRepository<PaloAltoIntegration, UUID> {
    Optional<PaloAltoIntegration> findByTenantId(UUID tenantId);
    void deleteByTenantId(UUID tenantId);

    /** Used only by IntegrationPollerService, under the system-poller RLS bypass. */
    List<PaloAltoIntegration> findByEnabledTrue();
}
