package com.netcradus.acis.platformadmin.repository;

import com.netcradus.acis.platformadmin.model.TenantActivation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TenantActivationRepository extends JpaRepository<TenantActivation, UUID> {
    Optional<TenantActivation> findByTokenHash(String tokenHash);

    List<TenantActivation> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);
}
