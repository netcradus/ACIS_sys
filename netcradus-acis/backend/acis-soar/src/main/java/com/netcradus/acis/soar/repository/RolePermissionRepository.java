package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.RolePermission;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RolePermissionRepository extends JpaRepository<RolePermission, UUID> {
    List<RolePermission> findByTenantId(UUID tenantId);
}
