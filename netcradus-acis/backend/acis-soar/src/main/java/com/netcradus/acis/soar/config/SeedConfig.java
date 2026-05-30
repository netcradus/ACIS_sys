package com.netcradus.acis.soar.config;

import com.netcradus.acis.soar.model.Playbook;
import com.netcradus.acis.soar.model.RedTeamSimulation;
import com.netcradus.acis.soar.repository.PlaybookRepository;
import com.netcradus.acis.soar.repository.RedTeamSimulationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.OffsetDateTime;
import java.util.UUID;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class SeedConfig {

    private final PlaybookRepository playbookRepository;
    private final RedTeamSimulationRepository simulationRepository;

    @Bean
    public CommandLineRunner seedData() {
        return args -> {
            UUID defaultTenantId = UUID.fromString("00000000-0000-0000-0000-000000000001");

            if (playbookRepository.count() == 0) {
                log.info("Seeding Playbooks...");
                
                Playbook p1 = new Playbook();
                p1.setTenantId(defaultTenantId);
                p1.setName("Isolate Endpoint (EDR)");
                p1.setDescription("6 steps • last run 1h ago");
                p1.setSteps("[{\"type\":\"isolate\"}]");
                p1.setSuccessCount(97);
                p1.setRunCount(100);
                p1.setLastRunAt(OffsetDateTime.now().minusHours(1));
                playbookRepository.save(p1);

                Playbook p2 = new Playbook();
                p2.setTenantId(defaultTenantId);
                p2.setName("Reset Compromised Account");
                p2.setDescription("5 steps • last run 2h ago");
                p2.setSteps("[{\"type\":\"reset_account\"}]");
                p2.setSuccessCount(92);
                p2.setRunCount(100);
                p2.setLastRunAt(OffsetDateTime.now().minusHours(2));
                playbookRepository.save(p2);

                Playbook p3 = new Playbook();
                p3.setTenantId(defaultTenantId);
                p3.setName("Block Domain on FW & Proxy");
                p3.setDescription("4 steps • last run 20m ago");
                p3.setSteps("[{\"type\":\"block_domain\"}]");
                p3.setSuccessCount(99);
                p3.setRunCount(100);
                p3.setLastRunAt(OffsetDateTime.now().minusMinutes(20));
                playbookRepository.save(p3);
            }

            if (simulationRepository.count() == 0) {
                log.info("Seeding Red Team Simulations...");
                
                RedTeamSimulation s1 = new RedTeamSimulation();
                s1.setTenantId(defaultTenantId);
                s1.setName("Phishing → Initial Access");
                s1.setDescription("Simulates a spear-phishing payload execution");
                s1.setMitreTechniques(java.util.Arrays.asList("T1566.001", "T1059.001"));
                s1.setMitreTactics(java.util.Arrays.asList("Initial Access", "Execution"));
                s1.setSteps("[{\"step\":\"email\"},{\"step\":\"attachment\"}]");
                s1.setRunCount(5);
                s1.setLastRunAt(OffsetDateTime.now().minusDays(1));
                simulationRepository.save(s1);

                RedTeamSimulation s2 = new RedTeamSimulation();
                s2.setTenantId(defaultTenantId);
                s2.setName("Living-off-the-Land Lateral");
                s2.setDescription("Uses PSExec and WMI for lateral movement");
                s2.setMitreTechniques(java.util.Arrays.asList("T1047", "T1569.002"));
                s2.setMitreTactics(java.util.Arrays.asList("Lateral Movement", "Execution"));
                s2.setSteps("[{\"step\":\"psexec\"},{\"step\":\"wmi\"},{\"step\":\"smb\"}]");
                s2.setRunCount(2);
                s2.setLastRunAt(OffsetDateTime.now().minusDays(2));
                simulationRepository.save(s2);

                RedTeamSimulation s3 = new RedTeamSimulation();
                s3.setTenantId(defaultTenantId);
                s3.setName("Data Exfil via DNS");
                s3.setDescription("Exfiltrates simulated sensitive data over DNS queries");
                s3.setMitreTechniques(java.util.Arrays.asList("T1048.003", "T1560"));
                s3.setMitreTactics(java.util.Arrays.asList("Exfiltration", "Collection"));
                s3.setSteps("[{\"step\":\"collect\"},{\"step\":\"compress\"},{\"step\":\"dns_query\"}]");
                s3.setRunCount(8);
                s3.setLastRunAt(OffsetDateTime.now().minusHours(5));
                simulationRepository.save(s3);
            }
        };
    }
}
