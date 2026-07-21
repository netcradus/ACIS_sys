package com.netcradus.acis.soar.config;

import com.netcradus.acis.soar.model.AuditEntry;
import com.netcradus.acis.soar.model.Organization;
import com.netcradus.acis.soar.model.LicenseDetails;
import com.netcradus.acis.soar.model.Invoice;
import com.netcradus.acis.soar.model.UserMember;
import com.netcradus.acis.soar.model.UserGroup;
import com.netcradus.acis.soar.repository.OrganizationRepository;
import com.netcradus.acis.soar.repository.LicenseDetailsRepository;
import com.netcradus.acis.soar.repository.InvoiceRepository;
import com.netcradus.acis.soar.repository.UserMemberRepository;
import com.netcradus.acis.soar.repository.UserGroupRepository;
import com.netcradus.acis.soar.model.Playbook;
import com.netcradus.acis.soar.model.PlaybookExecution;
import com.netcradus.acis.soar.model.RedTeamSimulation;
import com.netcradus.acis.soar.model.ReportSchedule;
import com.netcradus.acis.soar.model.ApiKey;
import com.netcradus.acis.soar.model.Integration;
import com.netcradus.acis.soar.repository.AuditEntryRepository;
import com.netcradus.acis.soar.repository.PlaybookExecutionRepository;
import com.netcradus.acis.soar.repository.PlaybookRepository;
import com.netcradus.acis.soar.repository.RedTeamSimulationRepository;
import com.netcradus.acis.soar.repository.ReportScheduleRepository;
import com.netcradus.acis.soar.repository.ApiKeyRepository;
import com.netcradus.acis.soar.repository.IntegrationRepository;
import com.netcradus.acis.common.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;

import java.time.OffsetDateTime;
import java.util.UUID;

@Configuration
@RequiredArgsConstructor
@Slf4j
public class SeedConfig {

    private final PlaybookRepository playbookRepository;
    private final RedTeamSimulationRepository simulationRepository;
    private final AuditEntryRepository auditEntryRepository;
    private final PlaybookExecutionRepository executionRepository;
    private final ReportScheduleRepository reportScheduleRepository;
    private final ApiKeyRepository apiKeyRepository;
    private final IntegrationRepository integrationRepository;
    private final OrganizationRepository organizationRepository;
    private final LicenseDetailsRepository licenseDetailsRepository;
    private final InvoiceRepository invoiceRepository;
    private final UserMemberRepository userMemberRepository;
    private final UserGroupRepository userGroupRepository;

    @Bean
    @Order(0) // must run before RlsConfig's enableRowLevelSecurity runner (Order 1000)
    public CommandLineRunner seedData() {
        return args -> {
            // Matches the tenant_id attribute seeded on the demo Keycloak users
            // in infra/keycloak/realm-acis.json (admin/analyst1/analyst2) and the
            // demo tenant used by AssetDataSeeder, so seeded data is actually
            // visible to a logged-in demo user once tenant enforcement is strict.
            UUID defaultTenantId = UUID.fromString("11111111-1111-4111-8111-111111111111");

            // RLS (enabled by RlsConfig) is a permanent DB-level setting that
            // survives restarts — on every run after the first, every seed
            // insert/delete/count below needs a tenant context, even though
            // this seeder runs before RlsConfig's runner in THIS process.
            try {
                TenantContext.setTenantId(defaultTenantId.toString());
                seed(defaultTenantId);
            } finally {
                TenantContext.clear();
            }
        };
    }

    private void seed(UUID defaultTenantId) {
        {
            // Wipe out old playbooks and executions for a fresh seeder state matching the screenshot
            log.info("Clearing playbooks and executions for fresh seed...");
            executionRepository.deleteAll();
            playbookRepository.deleteAll();

            log.info("Seeding Playbooks...");
            
            Playbook p1 = new Playbook();
            p1.setTenantId(defaultTenantId);
            p1.setName("Isolate Endpoint (EDR)");
            p1.setDescription("6 steps • last run 1h ago");
            p1.setSteps("[{\"step\":\"Check endpoint health\",\"status\":\"Completed\"},{\"step\":\"Quarantine via EDR API\",\"status\":\"Completed\"},{\"step\":\"Block outbound firewall\",\"status\":\"Completed\"}]");
            p1.setSuccessCount(97);
            p1.setRunCount(100);
            p1.setLastRunAt(OffsetDateTime.now().minusHours(1));
            p1 = playbookRepository.save(p1);

            Playbook p2 = new Playbook();
            p2.setTenantId(defaultTenantId);
            p2.setName("Reset Compromised Account");
            p2.setDescription("5 steps • last run 2h ago");
            p2.setSteps("[{\"step\":\"Disable AD account\",\"status\":\"Completed\"},{\"step\":\"Revoke all OAuth tokens\",\"status\":\"Completed\"},{\"step\":\"Force MFA re-enrollment\",\"status\":\"Completed\"}]");
            p2.setSuccessCount(92);
            p2.setRunCount(100);
            p2.setLastRunAt(OffsetDateTime.now().minusHours(2));
            p2 = playbookRepository.save(p2);

            Playbook p3 = new Playbook();
            p3.setTenantId(defaultTenantId);
            p3.setName("Block Domain on FW & Proxy");
            p3.setDescription("4 steps • last run 20m ago");
            p3.setSteps("[{\"step\":\"Add domain to block list\",\"status\":\"Completed\"},{\"step\":\"Push policy to Palo Alto\",\"status\":\"Completed\"},{\"step\":\"Update proxy ACL\",\"status\":\"Completed\"}]");
            p3.setSuccessCount(99);
            p3.setRunCount(100);
            p3.setLastRunAt(OffsetDateTime.now().minusMinutes(20));
            p3 = playbookRepository.save(p3);

            log.info("Seeding Playbook Executions matching screenshot...");

            UUID mockUserUuid = UUID.fromString("00000000-0000-0000-0000-000000000002");

            // Execution 1: Block Domain on FW & Proxy
            PlaybookExecution pe1 = new PlaybookExecution();
            pe1.setPlaybookId(p3.getId());
            pe1.setTriggeredBy(mockUserUuid);
            pe1.setTriggeredByName("analyst2@oouraa");
            pe1.setStatus("completed");
            pe1.setStartedAt(OffsetDateTime.now().minusMinutes(14));
            pe1.setCompletedAt(OffsetDateTime.now().minusMinutes(14).plusSeconds(12));
            pe1.setStepLogs("[{\"step\":\"Add domain to block list\",\"status\":\"Success\"}]");
            executionRepository.save(pe1);

            // Execution 2: Isolate Endpoint (EDR)
            PlaybookExecution pe2 = new PlaybookExecution();
            pe2.setPlaybookId(p1.getId());
            pe2.setTriggeredBy(mockUserUuid);
            pe2.setTriggeredByName("analyst1@oouraa");
            pe2.setStatus("completed");
            pe2.setStartedAt(OffsetDateTime.now().minusHours(1));
            pe2.setCompletedAt(OffsetDateTime.now().minusHours(1).plusSeconds(41));
            pe2.setStepLogs("[{\"step\":\"Quarantine via EDR API\",\"status\":\"Success\"}]");
            executionRepository.save(pe2);

            // Execution 3: Reset Compromised Account
            PlaybookExecution pe3 = new PlaybookExecution();
            pe3.setPlaybookId(p2.getId());
            pe3.setTriggeredBy(mockUserUuid);
            pe3.setTriggeredByName("auto-trigger");
            pe3.setStatus("completed");
            pe3.setStartedAt(OffsetDateTime.now().minusHours(2));
            pe3.setCompletedAt(OffsetDateTime.now().minusHours(2).plusSeconds(28));
            pe3.setStepLogs("[{\"step\":\"Disable AD account\",\"status\":\"Success\"}]");
            executionRepository.save(pe3);

            // Execution 4: Block Domain on FW & Proxy (Failed)
            PlaybookExecution pe4 = new PlaybookExecution();
            pe4.setPlaybookId(p3.getId());
            pe4.setTriggeredBy(mockUserUuid);
            pe4.setTriggeredByName("analyst3@oouraa");
            pe4.setStatus("failed");
            pe4.setStartedAt(OffsetDateTime.now().minusHours(3));
            pe4.setCompletedAt(OffsetDateTime.now().minusHours(3).plusSeconds(8));
            pe4.setStepLogs("[{\"step\":\"Push policy to Palo Alto\",\"status\":\"Failed - timeout error\"}]");
            executionRepository.save(pe4);

            // Execution 5: Isolate Endpoint (EDR)
            PlaybookExecution pe5 = new PlaybookExecution();
            pe5.setPlaybookId(p1.getId());
            pe5.setTriggeredBy(mockUserUuid);
            pe5.setTriggeredByName("analyst1@oouraa");
            pe5.setStatus("completed");
            pe5.setStartedAt(OffsetDateTime.now().minusHours(5));
            pe5.setCompletedAt(OffsetDateTime.now().minusHours(5).plusSeconds(39));
            pe5.setStepLogs("[{\"step\":\"Block outbound firewall\",\"status\":\"Success\"}]");
            executionRepository.save(pe5);

            // Execution 6: Reset Compromised Account (Running)
            PlaybookExecution pe6 = new PlaybookExecution();
            pe6.setPlaybookId(p2.getId());
            pe6.setTriggeredBy(mockUserUuid);
            pe6.setTriggeredByName("analyst2@oouraa");
            pe6.setStatus("running");
            pe6.setStartedAt(OffsetDateTime.now());
            pe6.setStepLogs("[{\"step\":\"Disable AD account\",\"status\":\"Success\"}]");
            executionRepository.save(pe6);


            log.info("Seeding Report Schedules...");
            reportScheduleRepository.deleteAll();

            ReportSchedule rs1 = new ReportSchedule();
            rs1.setReportName("Weekly Executive Summary");
            rs1.setFormat("PDF");
            rs1.setFrequency("Weekly Mon 08:00");
            rs1.setNextRun(OffsetDateTime.now().plusDays(3));
            rs1.setRecipients("4 recipients");
            rs1.setStatus("Active");
            reportScheduleRepository.save(rs1);

            ReportSchedule rs2 = new ReportSchedule();
            rs2.setReportName("Incident Board Pack");
            rs2.setFormat("PPTX");
            rs2.setFrequency("Monthly 1st");
            rs2.setNextRun(OffsetDateTime.now().plusMonths(1).withDayOfMonth(1).withHour(9).withMinute(0));
            rs2.setRecipients("2 recipients");
            rs2.setStatus("Active");
            reportScheduleRepository.save(rs2);

            ReportSchedule rs3 = new ReportSchedule();
            rs3.setReportName("Detection Coverage");
            rs3.setFormat("CSV");
            rs3.setFrequency("Monthly 1st");
            rs3.setNextRun(OffsetDateTime.now().plusMonths(1).withDayOfMonth(1).withHour(9).withMinute(0));
            rs3.setRecipients("1 recipient");
            rs3.setStatus("Active");
            reportScheduleRepository.save(rs3);

            ReportSchedule rs4 = new ReportSchedule();
            rs4.setReportName("Compliance Posture");
            rs4.setFormat("PDF");
            rs4.setFrequency("Quarterly");
            rs4.setNextRun(OffsetDateTime.now().plusMonths(3).withDayOfMonth(1).withHour(0).withMinute(0));
            rs4.setRecipients("3 recipients");
            rs4.setStatus("Active");
            reportScheduleRepository.save(rs4);

            ReportSchedule rs5 = new ReportSchedule();
            rs5.setReportName("Threat Intel Summary");
            rs5.setFormat("PDF");
            rs5.setFrequency("Weekly Fri");
            rs5.setNextRun(OffsetDateTime.now().plusDays(5));
            rs5.setRecipients("2 recipients");
            rs5.setStatus("Paused");
            reportScheduleRepository.save(rs5);


            if (apiKeyRepository.count() == 0) {
                log.info("Seeding Settings API Keys...");

                ApiKey k1 = new ApiKey();
                k1.setTenantId(defaultTenantId);
                k1.setKeyName("SOAR Automation Script");
                k1.setToken("oouraa_live_x8Fx8e...d9q");
                k1.setRole("API Read/Write");
                k1.setCreatedAt(OffsetDateTime.now().minusDays(50));
                k1.setLastUsedAt(OffsetDateTime.now().minusMinutes(2));
                k1.setStatus("Active");
                apiKeyRepository.save(k1);

                ApiKey k2 = new ApiKey();
                k2.setTenantId(defaultTenantId);
                k2.setKeyName("Splunk Forwarder Sync");
                k2.setToken("oouraa_live_k2Mk2m...a4z");
                k2.setRole("Data Ingest Only");
                k2.setCreatedAt(OffsetDateTime.now().minusDays(30));
                k2.setLastUsedAt(OffsetDateTime.now().minusHours(1));
                k2.setStatus("Active");
                apiKeyRepository.save(k2);

                ApiKey k3 = new ApiKey();
                k3.setTenantId(defaultTenantId);
                k3.setKeyName("Custom Dashboard Reader");
                k3.setToken("oouraa_read_f9Pf9p...v1m");
                k3.setRole("API Read Only");
                k3.setCreatedAt(OffsetDateTime.now().minusDays(20));
                k3.setStatus("Active");
                apiKeyRepository.save(k3);
            }

            if (integrationRepository.count() == 0) {
                log.info("Seeding Settings Integrations...");

                Integration i1 = new Integration();
                i1.setTenantId(defaultTenantId);
                i1.setName("Palo Alto Networks");
                i1.setDescription("Firewall logs ingestion and automated blocklist updates (SOAR).");
                i1.setLogoLetter("PA");
                i1.setStatus("Connected");
                integrationRepository.save(i1);

                Integration i2 = new Integration();
                i2.setTenantId(defaultTenantId);
                i2.setName("Okta");
                i2.setDescription("Identity context sync and automated credential revocation.");
                i2.setLogoLetter("O");
                i2.setStatus("Connected");
                integrationRepository.save(i2);

                Integration i3 = new Integration();
                i3.setTenantId(defaultTenantId);
                i3.setName("CrowdStrike");
                i3.setDescription("Falcon EDR alert ingestion and endpoint isolation capability.");
                i3.setLogoLetter("C");
                i3.setStatus("Connected");
                integrationRepository.save(i3);

                Integration i4 = new Integration();
                i4.setTenantId(defaultTenantId);
                i4.setName("Jira Service Desk");
                i4.setDescription("Bi-directional ticket creation and status synchronization for incidents.");
                i4.setLogoLetter("J");
                i4.setStatus("Connected");
                integrationRepository.save(i4);

                Integration i5 = new Integration();
                i5.setTenantId(defaultTenantId);
                i5.setName("AWS CloudTrail");
                i5.setDescription("Ingest IAM and API activity logs from connected AWS accounts.");
                i5.setLogoLetter("A");
                i5.setStatus("Connected");
                integrationRepository.save(i5);
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

            if (auditEntryRepository.count() == 0) {
                log.info("Seeding Audit Trail entries...");

                AuditEntry a1 = new AuditEntry();
                a1.setTenantId(defaultTenantId);
                a1.setUser("analyst2@acis");
                a1.setAction("PLAYBOOK_EXECUTE");
                a1.setResource("soar/block-domain");
                a1.setIp("192.168.1.44");
                a1.setStatus("Success");
                auditEntryRepository.save(a1);

                AuditEntry a2 = new AuditEntry();
                a2.setTenantId(defaultTenantId);
                a2.setUser("analyst1@acis");
                a2.setAction("ALERT_ASSIGN");
                a2.setResource("alert/AL-1000");
                a2.setIp("192.168.1.22");
                a2.setStatus("Success");
                auditEntryRepository.save(a2);

                AuditEntry a3 = new AuditEntry();
                a3.setTenantId(defaultTenantId);
                a3.setUser("analyst3@acis");
                a3.setAction("RULE_TOGGLE");
                a3.setResource("corr/impossible-travel");
                a3.setIp("192.168.1.67");
                a3.setStatus("Success");
                auditEntryRepository.save(a3);
            }

            if (organizationRepository.count() == 0) {
                log.info("Seeding Settings Organization...");
                Organization o = new Organization();
                o.setTenantId(defaultTenantId);
                o.setName("CyberHaxs Pvt. Ltd.");
                o.setOrgIdString("org_ch_8841kd");
                o.setIndustry("Managed Security Services");
                o.setPrimaryRegion("Asia Pacific (Ghaziabad, IN)");
                o.setSupportEmail("security@cyberhaxs.com");
                o.setTimeZone("IST (UTC +5:30)");
                organizationRepository.save(o);
            }

            if (licenseDetailsRepository.count() == 0) {
                log.info("Seeding Settings License & Billing...");
                LicenseDetails ld = new LicenseDetails();
                ld.setTenantId(defaultTenantId);
                ld.setPlanName("Enterprise Shield");
                ld.setPlanPrice("₹1,84,999/mo");
                ld.setPlanFeatures("Unlimited endpoints · 24/7 SOC support · Renews 14 Aug 2026");
                ld.setEndpointsMonitored(642);
                ld.setEndpointsLimit(1000);
                ld.setDataIngestion(1.8);
                ld.setDataIngestionLimit(2.5);
                ld.setApiCalls(402000);
                ld.setApiCallsLimit(1000000);
                ld.setCardBrand("VISA");
                ld.setCardLast4("4471");
                ld.setCardExpiry("08/28");
                ld.setBillingDetails("Billed to CyberHaxs Pvt. Ltd.");
                licenseDetailsRepository.save(ld);
            }

            if (invoiceRepository.count() == 0) {
                log.info("Seeding Settings Invoices...");

                Invoice inv1 = new Invoice();
                inv1.setTenantId(defaultTenantId);
                inv1.setInvoiceNumber("INV-2026-0071");
                inv1.setDate("01 Jul 2026");
                inv1.setAmount("₹1,84,999");
                inv1.setStatus("Paid");
                invoiceRepository.save(inv1);

                Invoice inv2 = new Invoice();
                inv2.setTenantId(defaultTenantId);
                inv2.setInvoiceNumber("INV-2026-0058");
                inv2.setDate("01 Jun 2026");
                inv2.setAmount("₹1,84,999");
                inv2.setStatus("Paid");
                invoiceRepository.save(inv2);

                Invoice inv3 = new Invoice();
                inv3.setTenantId(defaultTenantId);
                inv3.setInvoiceNumber("INV-2026-0044");
                inv3.setDate("01 May 2026");
                inv3.setAmount("₹1,79,500");
                inv3.setStatus("Paid");
                invoiceRepository.save(inv3);
            }

            if (userGroupRepository.count() == 0 && userMemberRepository.count() == 0) {
                log.info("Seeding Settings Users & Groups...");

                // Groups
                UserGroup g1 = new UserGroup();
                g1.setTenantId(defaultTenantId);
                g1.setName("SOC Analysts");
                g1.setDescription("Monitors alerts, triages events, escalates incidents.");
                g1.setMemberCount(6);
                g1.setBadgeInitials("SA");
                userGroupRepository.save(g1);

                UserGroup g2 = new UserGroup();
                g2.setTenantId(defaultTenantId);
                g2.setName("Incident Responders");
                g2.setDescription("Executes SOAR playbooks and containment actions.");
                g2.setMemberCount(3);
                g2.setBadgeInitials("IR");
                userGroupRepository.save(g2);

                UserGroup g3 = new UserGroup();
                g3.setTenantId(defaultTenantId);
                g3.setName("Admins");
                g3.setDescription("Full access to configuration, billing, and users.");
                g3.setMemberCount(2);
                g3.setBadgeInitials("AD");
                userGroupRepository.save(g3);

                // Members
                UserMember m1 = new UserMember();
                m1.setTenantId(defaultTenantId);
                m1.setName("Mohit Goel");
                m1.setEmail("mohit@cyberhaxs.com");
                m1.setGroupName("Admins");
                m1.setStatus("Active");
                m1.setLastLogin("2 mins ago");
                userMemberRepository.save(m1);

                UserMember m2 = new UserMember();
                m2.setTenantId(defaultTenantId);
                m2.setName("Ananya Sharma");
                m2.setEmail("ananya@cyberhaxs.com");
                m2.setGroupName("SOC Analysts");
                m2.setStatus("Active");
                m2.setLastLogin("1 hr ago");
                userMemberRepository.save(m2);

                UserMember m3 = new UserMember();
                m3.setTenantId(defaultTenantId);
                m3.setName("Rohit Verma");
                m3.setEmail("rohit@cyberhaxs.com");
                m3.setGroupName("Incident Responders");
                m3.setStatus("Active");
                m3.setLastLogin("Yesterday");
                userMemberRepository.save(m3);

                UserMember m4 = new UserMember();
                m4.setTenantId(defaultTenantId);
                m4.setName("Priya Nair");
                m4.setEmail("priya@cyberhaxs.com");
                m4.setGroupName("Auditors");
                m4.setStatus("Invited");
                m4.setLastLogin("Never");
                userMemberRepository.save(m4);
            }
        }
    }
}
