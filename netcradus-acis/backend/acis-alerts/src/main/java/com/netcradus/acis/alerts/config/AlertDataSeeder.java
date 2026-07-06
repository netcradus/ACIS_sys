package com.netcradus.acis.alerts.config;

import com.netcradus.acis.alerts.model.Alert;
import com.netcradus.acis.alerts.repository.AlertRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class AlertDataSeeder implements CommandLineRunner {

    private final AlertRepository repository;

    @Override
    public void run(String... args) {
        log.info("Clearing existing alerts for clean seed...");
        repository.deleteAll();
        log.info("Seeding initial alerts for ACIS demo matching screenshot...");

            Alert a1 = Alert.builder()
                    .id("AL-1000")
                    .tenantId("tenant-01")
                    .title("Credential stuffing spikes: 800+ failures/min")
                    .severity("CRITICAL")
                    .source("EDR")
                    .status("OPEN")
                    .ownerId("analyst1")
                    .rawEvent("{\"EventID\": 4625, \"src_ip\": \"10.0.12.44\", \"user\": \"j.singh\", \"target\": \"dc-prod-01 (Domain Controller)\", \"failures\": 847, \"window\": \"60s\"}")
                    .build();

            Alert a2 = Alert.builder()
                    .id("AL-1001")
                    .tenantId("tenant-01")
                    .title("Beaconing to rare domain cdn-x7.io")
                    .severity("HIGH")
                    .source("FW")
                    .status("INVESTIGATING")
                    .ownerId("analyst2")
                    .rawEvent("{\"EventID\": 3, \"src_ip\": \"10.0.12.50\", \"destination\": \"185.199.110.153\", \"domain\": \"cdn-x7.io\", \"bytes_sent\": 15430, \"protocol\": \"DNS\"}")
                    .build();

            Alert a3 = Alert.builder()
                    .id("AL-1002")
                    .tenantId("tenant-01")
                    .title("Credential stuffing spikes: 800+ failures/min")
                    .severity("HIGH")
                    .source("Proxy")
                    .status("MITIGATED")
                    .ownerId("analyst3")
                    .rawEvent("{\"EventID\": 4625, \"src_ip\": \"10.0.12.45\", \"user\": \"admin\", \"target\": \"web-portal\", \"failures\": 912, \"window\": \"60s\"}")
                    .build();

            Alert a4 = Alert.builder()
                    .id("AL-1003")
                    .tenantId("tenant-01")
                    .title("Beaconing to rare domain cdn-x7.io")
                    .severity("CRITICAL")
                    .source("Email")
                    .status("OPEN")
                    .ownerId("analyst1")
                    .rawEvent("{\"EventID\": 12, \"src_ip\": \"10.0.12.80\", \"sender\": \"malicious@phish.net\", \"subject\": \"Urgent Security Update Needed\"}")
                    .build();

            Alert a5 = Alert.builder()
                    .id("AL-1004")
                    .tenantId("tenant-01")
                    .title("Credential stuffing spikes: 800+ failures/min")
                    .severity("LOW")
                    .source("EDR")
                    .status("INVESTIGATING")
                    .ownerId("analyst2")
                    .rawEvent("{\"EventID\": 4625, \"src_ip\": \"10.0.12.92\", \"user\": \"test-user\", \"target\": \"exchange-server\", \"failures\": 815, \"window\": \"60s\"}")
                    .build();

            Alert a6 = Alert.builder()
                    .id("AL-1005")
                    .tenantId("tenant-01")
                    .title("Beaconing to rare domain cdn-x7.io")
                    .severity("MEDIUM")
                    .source("FW")
                    .status("MITIGATED")
                    .ownerId("analyst3")
                    .rawEvent("{\"EventID\": 3, \"src_ip\": \"10.0.12.51\", \"destination\": \"185.199.110.154\", \"domain\": \"cdn-x7.io\", \"bytes_sent\": 8430, \"protocol\": \"DNS\"}")
                    .build();

            Alert a7 = Alert.builder()
                    .id("AL-1006")
                    .tenantId("tenant-01")
                    .title("Credential stuffing spikes: 800+ failures/min")
                    .severity("HIGH")
                    .source("Proxy")
                    .status("OPEN")
                    .ownerId("analyst1")
                    .rawEvent("{\"EventID\": 4625, \"src_ip\": \"10.0.12.44\", \"user\": \"j.singh\", \"target\": \"dc-prod-01\", \"failures\": 847, \"window\": \"60s\"}")
                    .build();

            Alert a8 = Alert.builder()
                    .id("AL-1007")
                    .tenantId("tenant-01")
                    .title("Beaconing to rare domain cdn-x7.io")
                    .severity("CRITICAL")
                    .source("Email")
                    .status("INVESTIGATING")
                    .ownerId("analyst2")
                    .rawEvent("{\"EventID\": 12, \"src_ip\": \"10.0.12.80\", \"sender\": \"phisher@attack.org\", \"subject\": \"Action Required: Payroll confirmation\"}")
                    .build();

            Alert a9 = Alert.builder()
                    .id("AL-1008")
                    .tenantId("tenant-01")
                    .title("Suspicious ASR bypass via LOLBin")
                    .severity("LOW")
                    .source("EDR")
                    .status("MITIGATED")
                    .ownerId("analyst3")
                    .rawEvent("{\"EventID\": 1, \"process\": \"powershell.exe\", \"parent_process\": \"cmd.exe\", \"bypass_arg\": \"-nop -w hidden -c \\\"IEX (New-Object Net.WebClient).DownloadString...\\\"\"}")
                    .build();

            Alert a10 = Alert.builder()
                    .id("AL-1009")
                    .tenantId("tenant-01")
                    .title("Beaconing to rare domain cdn-x7.io")
                    .severity("MEDIUM")
                    .source("FW")
                    .status("OPEN")
                    .ownerId("analyst1")
                    .rawEvent("{\"EventID\": 3, \"src_ip\": \"10.0.12.50\", \"destination\": \"185.199.110.153\", \"domain\": \"cdn-x7.io\", \"bytes_sent\": 12400, \"protocol\": \"DNS\"}")
                    .build();

            Alert a11 = Alert.builder()
                    .id("AL-1010")
                    .tenantId("tenant-01")
                    .title("Impossible travel detected Mumbai→London")
                    .severity("HIGH")
                    .source("IAM")
                    .status("INVESTIGATING")
                    .ownerId("analyst2")
                    .rawEvent("{\"EventID\": 4624, \"user\": \"a.patel\", \"login_1_city\": \"Mumbai\", \"login_2_city\": \"London\", \"time_diff_minutes\": 15, \"src_ip_1\": \"115.110.15.22\", \"src_ip_2\": \"82.165.23.44\"}")
                    .build();

            repository.saveAll(List.of(a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11));
            log.info("Successfully seeded {} alerts", repository.count());
    }
}
