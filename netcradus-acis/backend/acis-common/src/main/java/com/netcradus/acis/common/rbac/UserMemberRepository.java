package com.netcradus.acis.common.rbac;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserMemberRepository extends JpaRepository<UserMember, UUID> {
    List<UserMember> findByTenantId(UUID tenantId);
    Optional<UserMember> findByIdAndTenantId(UUID id, UUID tenantId);
    Optional<UserMember> findByTenantIdAndEmailIgnoreCase(UUID tenantId, String email);

    /**
     * Real "insert if absent" via Postgres's ON CONFLICT DO NOTHING against
     * the (tenant_id, email) unique constraint — used by PermissionResolver's
     * auto-provisioning of a first-time login, which typically arrives as a
     * burst of concurrent requests. Deliberately not exception-driven (no
     * catch-and-retry on a constraint violation): that approach poisons
     * whatever Spring transaction is active when it fires, which is exactly
     * the transaction resolve()/resolveAll() also need to keep open for
     * UserMember.role's lazy proxy. This way, every concurrent caller just
     * runs the same idempotent statement and re-reads afterward — the loser
     * of the race sees the same row the winner created, no exception ever thrown.
     */
    @Modifying
    @Query(value = "INSERT INTO user_members (id, tenant_id, email, name, status) " +
            "VALUES (:id, :tenantId, :email, :name, :status) " +
            "ON CONFLICT (tenant_id, email) DO NOTHING", nativeQuery = true)
    void insertIfAbsent(@Param("id") UUID id, @Param("tenantId") UUID tenantId, @Param("email") String email,
                         @Param("name") String name, @Param("status") String status);
}
