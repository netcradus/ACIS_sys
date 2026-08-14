package com.netcradus.acis.soar.integrations.poller;

import com.netcradus.acis.soar.integrations.azuread.AzureAdIntegration;
import com.netcradus.acis.soar.integrations.azuread.AzureAdIntegrationRepository;
import com.netcradus.acis.soar.integrations.azuresentinel.AzureSentinelIntegration;
import com.netcradus.acis.soar.integrations.azuresentinel.AzureSentinelIntegrationRepository;
import com.netcradus.acis.soar.integrations.guardduty.GuardDutyIntegration;
import com.netcradus.acis.soar.integrations.guardduty.GuardDutyIntegrationRepository;
import com.netcradus.acis.soar.integrations.paloalto.PaloAltoIntegration;
import com.netcradus.acis.soar.integrations.paloalto.PaloAltoIntegrationRepository;
import com.netcradus.acis.soar.integrations.sentinelone.SentinelOneIntegration;
import com.netcradus.acis.soar.integrations.sentinelone.SentinelOneIntegrationRepository;
import com.netcradus.acis.soar.integrations.wazuh.WazuhIntegration;
import com.netcradus.acis.soar.integrations.wazuh.WazuhIntegrationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Real configured-integration status for this tenant, across the 6 vendor
 * pollers IntegrationPollerService actually polls — used by the Dashboard's
 * Operational Readiness score (integration connectivity %) and by the Live
 * Threat Feed / Network Telemetry panels to know whether there's a real data
 * source to read from before claiming anything is "scanning" or "nominal".
 * An integration a tenant never configured simply doesn't appear in the
 * list — never a fabricated "disconnected" placeholder for something that
 * was never set up.
 */
@RestController
@RequestMapping("/api/soar/settings/integrations")
@RequiredArgsConstructor
public class IntegrationStatusController {

    private final PaloAltoIntegrationRepository paloAltoRepository;
    private final WazuhIntegrationRepository wazuhRepository;
    private final SentinelOneIntegrationRepository sentinelOneRepository;
    private final GuardDutyIntegrationRepository guardDutyRepository;
    private final AzureSentinelIntegrationRepository azureSentinelRepository;
    private final AzureAdIntegrationRepository azureAdRepository;

    @GetMapping("/status")
    public ResponseEntity<List<Map<String, Object>>> getStatus(@RequestHeader("X-Tenant-ID") String tenantId) {
        UUID tid = UUID.fromString(tenantId);
        List<Map<String, Object>> result = new ArrayList<>();

        paloAltoRepository.findByTenantId(tid).ifPresent(i -> result.add(toStatus("Palo Alto", i.isEnabled(), i.getLastPollStatus(), i.getLastPollError(), i.getLastPolledAt())));
        wazuhRepository.findByTenantId(tid).ifPresent(i -> result.add(toStatus("Wazuh", i.isEnabled(), i.getLastPollStatus(), i.getLastPollError(), i.getLastPolledAt())));
        sentinelOneRepository.findByTenantId(tid).ifPresent(i -> result.add(toStatus("SentinelOne", i.isEnabled(), i.getLastPollStatus(), i.getLastPollError(), i.getLastPolledAt())));
        guardDutyRepository.findByTenantId(tid).ifPresent(i -> result.add(toStatus("AWS GuardDuty", i.isEnabled(), i.getLastPollStatus(), i.getLastPollError(), i.getLastPolledAt())));
        azureSentinelRepository.findByTenantId(tid).ifPresent(i -> result.add(toStatus("Azure Sentinel", i.isEnabled(), i.getLastPollStatus(), i.getLastPollError(), i.getLastPolledAt())));
        azureAdRepository.findByTenantId(tid).ifPresent(i -> result.add(toStatus("Azure AD", i.isEnabled(), i.getLastPollStatus(), i.getLastPollError(), i.getLastPolledAt())));

        return ResponseEntity.ok(result);
    }

    private Map<String, Object> toStatus(String name, boolean enabled, String lastPollStatus, String lastPollError, java.time.OffsetDateTime lastPolledAt) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("name", name);
        m.put("enabled", enabled);
        m.put("lastPollStatus", lastPollStatus);
        m.put("lastPollError", lastPollError);
        m.put("lastPolledAt", lastPolledAt);
        m.put("healthy", enabled && "SUCCESS".equalsIgnoreCase(lastPollStatus));
        return m;
    }
}
