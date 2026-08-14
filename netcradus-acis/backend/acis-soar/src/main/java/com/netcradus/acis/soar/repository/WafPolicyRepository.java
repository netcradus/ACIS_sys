package com.netcradus.acis.soar.repository;

import com.netcradus.acis.soar.model.WafPolicy;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface WafPolicyRepository extends JpaRepository<WafPolicy, UUID> {
}
