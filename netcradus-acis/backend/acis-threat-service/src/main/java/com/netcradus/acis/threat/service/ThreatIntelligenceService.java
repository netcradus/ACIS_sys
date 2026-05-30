package com.netcradus.acis.threat.service;

import com.netcradus.acis.threat.model.ThreatIndicator;
import com.netcradus.acis.threat.model.ThreatSeverity;
import com.netcradus.acis.threat.repository.ThreatIndicatorRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Random;

@Service
@RequiredArgsConstructor
@Slf4j
public class ThreatIntelligenceService {

    private final ThreatIndicatorRepository repository;
    private final Random random = new Random();

    @PostConstruct
    public void initMockData() {
        if (repository.count() == 0) {
            log.info("Generating initial mock threat indicators...");
            generateMockIndicator("192.168.1.100", "IP", ThreatSeverity.HIGH, "Known C2 Server", "AlienVault");
            generateMockIndicator("malicious-domain.com", "DOMAIN", ThreatSeverity.CRITICAL, "Phishing Domain", "Internal");
            generateMockIndicator("45.33.22.11", "IP", ThreatSeverity.MEDIUM, "Suspicious Scanner", "CrowdStrike");
        }
    }

    private void generateMockIndicator(String value, String type, ThreatSeverity severity, String desc, String source) {
        ThreatIndicator indicator = ThreatIndicator.builder()
                .value(value)
                .type(type)
                .severity(severity)
                .description(desc)
                .source(source)
                .lastSeen(LocalDateTime.now())
                .build();
        repository.save(indicator);
    }

    public List<ThreatIndicator> findAll() {
        return repository.findAll();
    }

    public Optional<ThreatIndicator> findByValue(String value) {
        return repository.findByValue(value);
    }

    @Scheduled(fixedRate = 600000) // Every 10 minutes
    public void updateFeeds() {
        log.info("Simulating threat feed update...");
        // In a real app, this would call external APIs
        String randomIp = "10.0.0." + random.nextInt(255);
        generateMockIndicator(randomIp, "IP", ThreatSeverity.LOW, "Auto-generated suspicious IP", "System Mock");
    }
}
