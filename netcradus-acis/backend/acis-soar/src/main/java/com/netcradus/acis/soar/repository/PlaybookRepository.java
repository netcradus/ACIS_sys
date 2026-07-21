package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.Playbook;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlaybookRepository extends JpaRepository<Playbook, UUID> {
    List<Playbook> findByTenantId(UUID tenantId);
    Optional<Playbook> findByIdAndTenantId(UUID id, UUID tenantId);
}
