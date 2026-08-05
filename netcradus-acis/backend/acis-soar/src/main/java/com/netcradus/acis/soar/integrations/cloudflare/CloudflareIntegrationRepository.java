package com.netcradus.acis.soar.integrations.cloudflare;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface CloudflareIntegrationRepository extends JpaRepository<CloudflareIntegration, UUID> {
    Optional<CloudflareIntegration> findByTenantId(UUID tenantId);
    void deleteByTenantId(UUID tenantId);
}
