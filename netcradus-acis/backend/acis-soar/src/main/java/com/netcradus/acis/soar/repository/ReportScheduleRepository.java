package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.ReportSchedule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ReportScheduleRepository extends JpaRepository<ReportSchedule, UUID> {
    List<ReportSchedule> findByTenantId(UUID tenantId);
    Optional<ReportSchedule> findByIdAndTenantId(UUID id, UUID tenantId);
}
