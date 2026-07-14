package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.LicenseDetails;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface LicenseDetailsRepository extends JpaRepository<LicenseDetails, UUID> {
}
