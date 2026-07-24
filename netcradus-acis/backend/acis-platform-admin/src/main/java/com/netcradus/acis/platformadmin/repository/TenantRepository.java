package com.netcradus.acis.platformadmin.repository;

import com.netcradus.acis.platformadmin.model.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface TenantRepository extends JpaRepository<Tenant, UUID> {
}
