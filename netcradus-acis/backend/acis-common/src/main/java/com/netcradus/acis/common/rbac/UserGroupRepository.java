package com.netcradus.acis.common.rbac;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserGroupRepository extends JpaRepository<UserGroup, UUID> {
    List<UserGroup> findByTenantId(UUID tenantId);
    Optional<UserGroup> findByIdAndTenantId(UUID id, UUID tenantId);
}
