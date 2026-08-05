package com.netcradus.acis.soar.integrations.azuread;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AzureAdIntegrationRepository extends JpaRepository<AzureAdIntegration, UUID> {
    Optional<AzureAdIntegration> findByTenantId(UUID tenantId);
    void deleteByTenantId(UUID tenantId);

    /** Used only by IntegrationPollerService, under the system-poller RLS bypass. */
    List<AzureAdIntegration> findByEnabledTrue();
}
