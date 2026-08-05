package com.netcradus.acis.common.rbac;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConsoleRoleRepository extends JpaRepository<ConsoleRole, UUID> {
    List<ConsoleRole> findByTenantId(UUID tenantId);
    Optional<ConsoleRole> findByIdAndTenantId(UUID id, UUID tenantId);
}
