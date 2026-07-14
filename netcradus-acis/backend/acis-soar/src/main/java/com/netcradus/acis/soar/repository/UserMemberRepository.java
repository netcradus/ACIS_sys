package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.UserMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserMemberRepository extends JpaRepository<UserMember, UUID> {
    List<UserMember> findByTenantId(UUID tenantId);
    Optional<UserMember> findByIdAndTenantId(UUID id, UUID tenantId);
    Optional<UserMember> findByTenantIdAndEmailIgnoreCase(UUID tenantId, String email);
}
