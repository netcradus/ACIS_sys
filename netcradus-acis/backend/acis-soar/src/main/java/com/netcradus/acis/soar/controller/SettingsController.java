package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.soar.model.ApiKey;
import com.netcradus.acis.soar.model.Integration;
import com.netcradus.acis.soar.model.Organization;
import com.netcradus.acis.soar.model.LicenseDetails;
import com.netcradus.acis.soar.model.Invoice;
import com.netcradus.acis.soar.model.UserMember;
import com.netcradus.acis.soar.model.UserGroup;
import com.netcradus.acis.soar.repository.ApiKeyRepository;
import com.netcradus.acis.soar.repository.IntegrationRepository;
import com.netcradus.acis.soar.repository.OrganizationRepository;
import com.netcradus.acis.soar.repository.LicenseDetailsRepository;
import com.netcradus.acis.soar.repository.InvoiceRepository;
import com.netcradus.acis.soar.repository.UserMemberRepository;
import com.netcradus.acis.soar.repository.UserGroupRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.security.SecureRandom;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/soar/settings")
@RequiredArgsConstructor
public class SettingsController {

    private static final UUID DEFAULT_TENANT = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[\\w.+-]+@[\\w-]+\\.[a-zA-Z]{2,}$");

    private final ApiKeyRepository apiKeyRepository;
    private final IntegrationRepository integrationRepository;
    private final OrganizationRepository organizationRepository;
    private final LicenseDetailsRepository licenseDetailsRepository;
    private final InvoiceRepository invoiceRepository;
    private final UserMemberRepository userMemberRepository;
    private final UserGroupRepository userGroupRepository;

    private UUID resolveTenant(UUID tenantId) {
        return tenantId != null ? tenantId : DEFAULT_TENANT;
    }

    // ── API Keys ──────────────────────────────────────────────

    @GetMapping("/keys")
    public ApiResponse<List<ApiKey>> getKeys(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return ApiResponse.success(apiKeyRepository.findByTenantId(resolveTenant(tenantId)));
    }

    @PostMapping("/keys")
    public ResponseEntity<ApiResponse<ApiKey>> generateKey(@RequestBody ApiKey key,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        if (key.getKeyName() == null || key.getKeyName().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Key name is required"));
        }
        key.setTenantId(resolveTenant(tenantId));
        key.setToken(generateRandomToken());
        key.setCreatedAt(OffsetDateTime.now());
        key.setStatus("Active");
        return ResponseEntity.ok(ApiResponse.success(apiKeyRepository.save(key)));
    }

    @PutMapping("/keys/{id}/revoke")
    public ResponseEntity<ApiResponse<ApiKey>> revokeKey(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return apiKeyRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(k -> {
                    k.setStatus("Revoked");
                    return ResponseEntity.ok(ApiResponse.success(apiKeyRepository.save(k)));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Key not found")));
    }

    @DeleteMapping("/keys/{id}")
    public ResponseEntity<ApiResponse<String>> deleteKey(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return apiKeyRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(k -> {
                    apiKeyRepository.delete(k);
                    return ResponseEntity.ok(ApiResponse.success("Key deleted successfully"));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Key not found")));
    }

    // ── Integrations ──────────────────────────────────────────

    @GetMapping("/integrations")
    public ApiResponse<List<Integration>> getIntegrations(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return ApiResponse.success(integrationRepository.findByTenantId(resolveTenant(tenantId)));
    }

    @PostMapping("/integrations")
    public ResponseEntity<ApiResponse<Integration>> addIntegration(@RequestBody Integration integration,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        if (integration.getName() == null || integration.getName().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Integration name is required"));
        }
        integration.setTenantId(resolveTenant(tenantId));
        integration.setStatus("Connected");
        return ResponseEntity.ok(ApiResponse.success(integrationRepository.save(integration)));
    }

    @PutMapping("/integrations/{id}/toggle")
    public ResponseEntity<ApiResponse<Integration>> toggleIntegration(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return integrationRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(i -> {
                    i.setStatus("Connected".equals(i.getStatus()) ? "Disconnected" : "Connected");
                    return ResponseEntity.ok(ApiResponse.success(integrationRepository.save(i)));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Integration not found")));
    }

    // ── Organization ──────────────────────────────────────────

    @GetMapping("/organization")
    public ApiResponse<Organization> getOrganization(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        List<Organization> orgs = organizationRepository.findByTenantId(tenant);
        if (orgs.isEmpty()) {
            Organization defaultOrg = new Organization();
            defaultOrg.setTenantId(tenant);
            defaultOrg.setName("CyberHaxs Pvt. Ltd.");
            defaultOrg.setOrgIdString("org_ch_8841kd");
            defaultOrg.setIndustry("Managed Security Services");
            defaultOrg.setPrimaryRegion("Asia Pacific (Ghaziabad, IN)");
            defaultOrg.setSupportEmail("security@cyberhaxs.com");
            defaultOrg.setTimeZone("IST (UTC +5:30)");
            return ApiResponse.success(organizationRepository.save(defaultOrg));
        }
        return ApiResponse.success(orgs.get(0));
    }

    @PutMapping("/organization")
    public ApiResponse<Organization> updateOrganization(@RequestBody Organization updatedOrg,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        List<Organization> orgs = organizationRepository.findByTenantId(tenant);
        Organization orgToUpdate;
        if (orgs.isEmpty()) {
            orgToUpdate = new Organization();
            orgToUpdate.setTenantId(tenant);
        } else {
            orgToUpdate = orgs.get(0);
        }
        orgToUpdate.setName(updatedOrg.getName());
        orgToUpdate.setOrgIdString(updatedOrg.getOrgIdString());
        orgToUpdate.setIndustry(updatedOrg.getIndustry());
        orgToUpdate.setPrimaryRegion(updatedOrg.getPrimaryRegion());
        orgToUpdate.setSupportEmail(updatedOrg.getSupportEmail());
        orgToUpdate.setTimeZone(updatedOrg.getTimeZone());
        return ApiResponse.success(organizationRepository.save(orgToUpdate));
    }

    @PostMapping("/organization/transfer")
    public ResponseEntity<ApiResponse<String>> transferOwnership(@RequestBody String newOwnerEmail,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        String email = newOwnerEmail == null ? "" : newOwnerEmail.trim();
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("A valid email address is required"));
        }
        return userMemberRepository.findByTenantIdAndEmailIgnoreCase(tenant, email)
                .map(member -> {
                    List<Organization> orgs = organizationRepository.findByTenantId(tenant);
                    if (orgs.isEmpty()) {
                        return ResponseEntity.status(404).body(ApiResponse.<String>error("Organization not found"));
                    }
                    Organization org = orgs.get(0);
                    org.setOwnerEmail(email);
                    organizationRepository.save(org);
                    return ResponseEntity.ok(ApiResponse.success("Organization ownership successfully transferred to " + email));
                })
                .orElseGet(() -> ResponseEntity.badRequest()
                        .body(ApiResponse.error("No member with that email exists in this organization — invite them first")));
    }

    @DeleteMapping("/organization")
    public ApiResponse<String> deleteOrganization(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        organizationRepository.deleteAll(organizationRepository.findByTenantId(resolveTenant(tenantId)));
        return ApiResponse.success("Organization successfully deleted and reset.");
    }

    // ── License & Billing ─────────────────────────────────────

    @GetMapping("/license")
    public ApiResponse<LicenseDetails> getLicenseDetails(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        List<LicenseDetails> details = licenseDetailsRepository.findByTenantId(tenant);
        if (details.isEmpty()) {
            LicenseDetails ld = new LicenseDetails();
            ld.setTenantId(tenant);
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
            return ApiResponse.success(licenseDetailsRepository.save(ld));
        }
        return ApiResponse.success(details.get(0));
    }

    @PostMapping("/license/change-plan")
    public ApiResponse<LicenseDetails> changePlan(@RequestBody String newPlanName,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        List<LicenseDetails> details = licenseDetailsRepository.findByTenantId(tenant);
        LicenseDetails ld = details.isEmpty() ? new LicenseDetails() : details.get(0);
        ld.setTenantId(tenant);
        ld.setPlanName(newPlanName);
        if ("Enterprise Shield".equalsIgnoreCase(newPlanName)) {
            ld.setPlanPrice("₹1,84,999/mo");
            ld.setPlanFeatures("Unlimited endpoints · 24/7 SOC support · Renews 14 Aug 2026");
        } else if ("Growth Shield".equalsIgnoreCase(newPlanName)) {
            ld.setPlanPrice("₹99,999/mo");
            ld.setPlanFeatures("Up to 500 endpoints · 8/5 support · Renews 14 Aug 2026");
        } else {
            ld.setPlanPrice("₹49,999/mo");
            ld.setPlanFeatures("Up to 100 endpoints · Email support · Renews 14 Aug 2026");
        }
        return ApiResponse.success(licenseDetailsRepository.save(ld));
    }

    @PutMapping("/license/payment-method")
    public ApiResponse<LicenseDetails> updatePaymentMethod(@RequestBody LicenseDetails paymentData,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        List<LicenseDetails> details = licenseDetailsRepository.findByTenantId(tenant);
        LicenseDetails ld = details.isEmpty() ? new LicenseDetails() : details.get(0);
        ld.setTenantId(tenant);
        ld.setCardBrand(paymentData.getCardBrand());
        ld.setCardLast4(paymentData.getCardLast4());
        ld.setCardExpiry(paymentData.getCardExpiry());
        ld.setBillingDetails(paymentData.getBillingDetails());
        return ApiResponse.success(licenseDetailsRepository.save(ld));
    }

    @GetMapping("/invoices")
    public ApiResponse<List<Invoice>> getInvoices(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return ApiResponse.success(invoiceRepository.findByTenantId(resolveTenant(tenantId)));
    }

    @GetMapping("/invoices/{id}/download")
    public ResponseEntity<byte[]> downloadInvoice(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return invoiceRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(invoice -> {
                    String content = "ACIS INVOICE STATEMENT\n"
                            + "========================\n"
                            + "Invoice Number: " + invoice.getInvoiceNumber() + "\n"
                            + "Date:           " + invoice.getDate() + "\n"
                            + "Amount:         " + invoice.getAmount() + "\n"
                            + "Status:         " + invoice.getStatus() + "\n";
                    byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
                    return ResponseEntity.ok()
                            .contentType(MediaType.TEXT_PLAIN)
                            .header(HttpHeaders.CONTENT_DISPOSITION,
                                    "attachment; filename=\"" + invoice.getInvoiceNumber() + ".txt\"")
                            .body(bytes);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    // ── Users & Groups ────────────────────────────────────────

    @GetMapping("/users")
    public ApiResponse<List<UserMember>> getUsers(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return ApiResponse.success(userMemberRepository.findByTenantId(resolveTenant(tenantId)));
    }

    @PostMapping("/users/invite")
    public ResponseEntity<ApiResponse<UserMember>> inviteUser(@RequestBody UserMember member,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        String email = member.getEmail() == null ? "" : member.getEmail().trim();
        if (member.getName() == null || member.getName().isBlank() || !EMAIL_PATTERN.matcher(email).matches()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("A name and a valid email address are required"));
        }
        if (userMemberRepository.findByTenantIdAndEmailIgnoreCase(tenant, email).isPresent()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("A member with that email already exists"));
        }
        member.setEmail(email);
        member.setTenantId(tenant);
        member.setStatus("Invited");
        member.setLastLogin("Never");
        return ResponseEntity.ok(ApiResponse.success(userMemberRepository.save(member)));
    }

    @PostMapping("/users/{id}/resend")
    public ResponseEntity<ApiResponse<UserMember>> resendInvite(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return userMemberRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(m -> {
                    m.setStatus("Invited");
                    return ResponseEntity.ok(ApiResponse.success(userMemberRepository.save(m)));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("User member not found")));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<ApiResponse<String>> deleteUser(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return userMemberRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(m -> {
                    userMemberRepository.delete(m);
                    return ResponseEntity.ok(ApiResponse.success("User member removed successfully"));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("User member not found")));
    }

    @GetMapping("/groups")
    public ApiResponse<List<UserGroup>> getGroups(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return ApiResponse.success(userGroupRepository.findByTenantId(resolveTenant(tenantId)));
    }

    @PostMapping("/groups")
    public ResponseEntity<ApiResponse<UserGroup>> createGroup(@RequestBody UserGroup group,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        if (group.getName() == null || group.getName().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Group name is required"));
        }
        group.setTenantId(resolveTenant(tenantId));
        if (group.getMemberCount() == null) {
            group.setMemberCount(0);
        }
        if (group.getBadgeInitials() == null || group.getBadgeInitials().isEmpty()) {
            String initials = "";
            String[] words = group.getName().trim().split("\\s+");
            if (words.length > 0 && !words[0].isEmpty()) {
                initials += words[0].substring(0, 1).toUpperCase();
            }
            if (words.length > 1 && !words[1].isEmpty()) {
                initials += words[1].substring(0, 1).toUpperCase();
            }
            if (initials.isEmpty()) {
                initials = "GP";
            }
            group.setBadgeInitials(initials);
        }
        return ResponseEntity.ok(ApiResponse.success(userGroupRepository.save(group)));
    }

    private String generateRandomToken() {
        String chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        SecureRandom random = new SecureRandom();
        StringBuilder sb = new StringBuilder("oouraa_live_");
        for (int i = 0; i < 16; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        sb.append("...");
        for (int i = 0; i < 4; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }
}
