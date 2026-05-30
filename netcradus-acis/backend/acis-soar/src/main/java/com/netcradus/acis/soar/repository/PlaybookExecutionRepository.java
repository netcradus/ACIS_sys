package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.PlaybookExecution;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface PlaybookExecutionRepository extends JpaRepository<PlaybookExecution, UUID> {
    List<PlaybookExecution> findByPlaybookId(UUID playbookId);
}
