package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.UserGroup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface UserGroupRepository extends JpaRepository<UserGroup, UUID> {
    List<UserGroup> findByTenantId(UUID tenantId);
}
