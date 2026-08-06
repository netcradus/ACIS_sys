package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.AgentEnrollmentToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AgentEnrollmentTokenRepository extends JpaRepository<AgentEnrollmentToken, UUID> {
    Optional<AgentEnrollmentToken> findByTenantId(UUID tenantId);

    /** The one lookup a heartbeat/install script needs before any tenant is known — see AgentController. */
    Optional<AgentEnrollmentToken> findByTokenHash(String tokenHash);
}
