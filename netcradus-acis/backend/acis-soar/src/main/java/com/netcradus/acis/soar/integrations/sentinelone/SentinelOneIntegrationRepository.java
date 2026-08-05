package com.netcradus.acis.soar.integrations.sentinelone;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SentinelOneIntegrationRepository extends JpaRepository<SentinelOneIntegration, UUID> {
    Optional<SentinelOneIntegration> findByTenantId(UUID tenantId);
    void deleteByTenantId(UUID tenantId);

    /** Used only by IntegrationPollerService, under the system-poller RLS bypass. */
    List<SentinelOneIntegration> findByEnabledTrue();
}
