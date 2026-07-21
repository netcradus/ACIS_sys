package com.netcradus.acis.log.service;

import com.netcradus.acis.log.model.LogDocument;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class MockLogGenerator {

    // Matches the tenant_id attribute seeded on the demo Keycloak users in
    // infra/keycloak/realm-acis.json (admin/analyst1/analyst2). This generator
    // has no per-request context (it runs on a @Scheduled thread), so synthetic
    // demo events are always attributed to the demo tenant, never left tenant-less.
    private static final String DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final Random random = new Random();

    private final List<String> services = List.of("acis-gateway", "auth-service", "firewall", "ids-ips", "netcradus-waf");
    private final List<String> levels = List.of("INFO", "INFO", "INFO", "WARN", "ERROR", "CRITICAL");
    private final List<String> messages = List.of(
        "User login successful from 192.168.1.45",
        "Outbound connection detected to known C2 server: 192.168.1.100",
        "Potential SQL Injection attempt blocked from 45.33.22.11",
        "Encrypted tunnel established from Primary-Gateway (192.168.1.1)",
        "Outbound connection detected to high-risk IP: 45.122.3.1",
        "CPU usage spiked above 95% on Core-Database-Prod (10.0.0.5)",
        "Database connection pool reaching saturation limit",
        "Malicious payload detected by IDS/IPS signature: 10455",
        "TLS certificate expiring in 5 days for netcradus.com",
        "API rate limit exceeded for client: 884a22-cc44"
    );

    @Scheduled(fixedRate = 3000)
    public void generateMockLog() {
        String level = levels.get(random.nextInt(levels.size()));
        String service = services.get(random.nextInt(services.size()));
        String message = messages.get(random.nextInt(messages.size()));

        LogDocument logDocument = LogDocument.builder()
            .id(UUID.randomUUID().toString())
            .tenantId(DEMO_TENANT_ID)
            .timestamp(Instant.now())
            .message(message)
            .level(level)
            .service(service)
            .host("node-" + random.nextInt(10) + ".acis.internal")
            .traceId(UUID.randomUUID().toString())
            .metadata(Map.of("category", "SIEM_AUTO_GEN", "priority", level.equals("CRITICAL") ? 1 : 10))
            .build();

        log.debug("Generating mock log for topic: acis-logs");
        kafkaTemplate.send("acis-logs", logDocument);
    }
}
