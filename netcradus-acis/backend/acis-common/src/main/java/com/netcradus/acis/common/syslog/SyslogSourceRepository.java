package com.netcradus.acis.common.syslog;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SyslogSourceRepository extends JpaRepository<SyslogSource, UUID> {
    Optional<SyslogSource> findByTenantId(UUID tenantId);
    void deleteByTenantId(UUID tenantId);

    /**
     * Used by SyslogSourceController's port allocator (to find the next free
     * port in the configured range) and SyslogListenerService's socket sync
     * — both legitimately cross-tenant, under the system-poller RLS bypass.
     * findAll() is inherited from JpaRepository and used the same way.
     */
    List<SyslogSource> findByEnabledTrue();
}
