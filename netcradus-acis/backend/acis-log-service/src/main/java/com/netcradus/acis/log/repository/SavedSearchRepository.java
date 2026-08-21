package com.netcradus.acis.log.repository;

import com.netcradus.acis.log.model.SavedSearch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SavedSearchRepository extends JpaRepository<SavedSearch, UUID> {
    List<SavedSearch> findByTenantIdAndUserIdOrderByUpdatedAtDesc(String tenantId, String userId);
    Optional<SavedSearch> findByTenantIdAndUserIdAndName(String tenantId, String userId, String name);
    Optional<SavedSearch> findByIdAndTenantIdAndUserId(UUID id, String tenantId, String userId);
}
