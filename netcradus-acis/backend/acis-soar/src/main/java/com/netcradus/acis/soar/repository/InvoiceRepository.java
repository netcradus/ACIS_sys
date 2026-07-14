package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.Invoice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {
    List<Invoice> findByTenantId(UUID tenantId);
    Optional<Invoice> findByIdAndTenantId(UUID id, UUID tenantId);
}
