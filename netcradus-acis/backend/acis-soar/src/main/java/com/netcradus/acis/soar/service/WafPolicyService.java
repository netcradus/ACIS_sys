package com.netcradus.acis.soar.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.netcradus.acis.soar.model.WafPolicy;
import com.netcradus.acis.soar.repository.WafPolicyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class WafPolicyService {

    private final WafPolicyRepository repository;
    private final ObjectMapper objectMapper;

    public record PolicyView(String mode, List<String> disabledCategories) {}

    /** Tenants with no explicit row get the safe default: BLOCK, nothing disabled. */
    public PolicyView getPolicy(UUID tenantId) {
        return repository.findById(tenantId)
                .map(this::toView)
                .orElseGet(() -> new PolicyView("BLOCK", List.of()));
    }

    public PolicyView upsertPolicy(UUID tenantId, String mode, List<String> disabledCategories) {
        if (!"BLOCK".equals(mode) && !"MONITOR".equals(mode)) {
            throw new IllegalArgumentException("mode must be BLOCK or MONITOR");
        }
        WafPolicy policy = repository.findById(tenantId).orElseGet(() -> {
            WafPolicy p = new WafPolicy();
            p.setTenantId(tenantId);
            return p;
        });
        policy.setMode(mode);
        try {
            policy.setDisabledCategories(objectMapper.writeValueAsString(
                    disabledCategories == null ? List.of() : disabledCategories));
        } catch (Exception e) {
            log.warn("Failed to serialize disabledCategories, defaulting to empty: {}", e.getMessage());
            policy.setDisabledCategories("[]");
        }
        repository.save(policy);
        return toView(policy);
    }

    /** Bulk view consumed only by acis-gateway's internal poller (see WafSettingsController's /internal/all). */
    public Map<UUID, PolicyView> getAllPolicies() {
        Map<UUID, PolicyView> result = new HashMap<>();
        for (WafPolicy policy : repository.findAll()) {
            result.put(policy.getTenantId(), toView(policy));
        }
        return result;
    }

    private PolicyView toView(WafPolicy policy) {
        List<String> disabled;
        try {
            disabled = objectMapper.readValue(policy.getDisabledCategories(),
                    objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
        } catch (Exception e) {
            disabled = new ArrayList<>();
        }
        return new PolicyView(policy.getMode(), disabled);
    }
}
