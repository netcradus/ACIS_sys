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
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.security.SecureRandom;

@RestController
@RequestMapping("/api/soar/settings")
@RequiredArgsConstructor
public class SettingsController {

    private final ApiKeyRepository apiKeyRepository;
    private final IntegrationRepository integrationRepository;
    private final OrganizationRepository organizationRepository;
    private final LicenseDetailsRepository licenseDetailsRepository;
    private final InvoiceRepository invoiceRepository;
    private final UserMemberRepository userMemberRepository;
    private final UserGroupRepository userGroupRepository;

    @GetMapping("/keys")
    public ApiResponse<List<ApiKey>> getKeys() {
        return ApiResponse.success(apiKeyRepository.findAll());
    }

    @PostMapping("/keys")
    public ApiResponse<ApiKey> generateKey(@RequestBody ApiKey key) {
        key.setToken(generateRandomToken());
        key.setCreatedAt(OffsetDateTime.now());
        key.setStatus("Active");
        return ApiResponse.success(apiKeyRepository.save(key));
    }

    @PutMapping("/keys/{id}/revoke")
    public ApiResponse<ApiKey> revokeKey(@PathVariable UUID id) {
        return apiKeyRepository.findById(id)
                .map(k -> {
                    k.setStatus("Revoked");
                    return ApiResponse.success(apiKeyRepository.save(k));
                })
                .orElse(ApiResponse.error("Key not found"));
    }

    @DeleteMapping("/keys/{id}")
    public ApiResponse<String> deleteKey(@PathVariable UUID id) {
        apiKeyRepository.deleteById(id);
        return ApiResponse.success("Key deleted successfully");
    }

    @GetMapping("/integrations")
    public ApiResponse<List<Integration>> getIntegrations() {
        return ApiResponse.success(integrationRepository.findAll());
    }

    @PostMapping("/integrations")
    public ApiResponse<Integration> addIntegration(@RequestBody Integration integration) {
        integration.setStatus("Connected");
        return ApiResponse.success(integrationRepository.save(integration));
    }

    @PutMapping("/integrations/{id}/toggle")
    public ApiResponse<Integration> toggleIntegration(@PathVariable UUID id) {
        return integrationRepository.findById(id)
                .map(i -> {
                    i.setStatus("Connected".equals(i.getStatus()) ? "Disconnected" : "Connected");
                    return ApiResponse.success(integrationRepository.save(i));
                })
                .orElse(ApiResponse.error("Integration not found"));
    }

    @GetMapping("/organization")
    public ApiResponse<Organization> getOrganization() {
        List<Organization> orgs = organizationRepository.findAll();
        if (orgs.isEmpty()) {
            Organization defaultOrg = new Organization();
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
    public ApiResponse<Organization> updateOrganization(@RequestBody Organization updatedOrg) {
        List<Organization> orgs = organizationRepository.findAll();
        Organization orgToUpdate;
        if (orgs.isEmpty()) {
            orgToUpdate = new Organization();
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
    public ApiResponse<String> transferOwnership(@RequestBody String newOwnerEmail) {
        return ApiResponse.success("Organization ownership successfully transferred to " + newOwnerEmail);
    }

    @DeleteMapping("/organization")
    public ApiResponse<String> deleteOrganization() {
        organizationRepository.deleteAll();
        return ApiResponse.success("Organization successfully deleted and reset.");
    }

    @GetMapping("/license")
    public ApiResponse<LicenseDetails> getLicenseDetails() {
        List<LicenseDetails> details = licenseDetailsRepository.findAll();
        if (details.isEmpty()) {
            LicenseDetails ld = new LicenseDetails();
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
    public ApiResponse<LicenseDetails> changePlan(@RequestBody String newPlanName) {
        List<LicenseDetails> details = licenseDetailsRepository.findAll();
        LicenseDetails ld = details.isEmpty() ? new LicenseDetails() : details.get(0);
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
    public ApiResponse<LicenseDetails> updatePaymentMethod(@RequestBody LicenseDetails paymentData) {
        List<LicenseDetails> details = licenseDetailsRepository.findAll();
        LicenseDetails ld = details.isEmpty() ? new LicenseDetails() : details.get(0);
        ld.setCardBrand(paymentData.getCardBrand());
        ld.setCardLast4(paymentData.getCardLast4());
        ld.setCardExpiry(paymentData.getCardExpiry());
        ld.setBillingDetails(paymentData.getBillingDetails());
        return ApiResponse.success(licenseDetailsRepository.save(ld));
    }

    @GetMapping("/invoices")
    public ApiResponse<List<Invoice>> getInvoices() {
        return ApiResponse.success(invoiceRepository.findAll());
    }

    @GetMapping("/invoices/{id}/download")
    public byte[] downloadInvoice(@PathVariable UUID id) {
        return "MOCK_PDF_INVOICE_CONTENT_DATA".getBytes();
    }

    @GetMapping("/users")
    public ApiResponse<List<UserMember>> getUsers() {
        return ApiResponse.success(userMemberRepository.findAll());
    }

    @PostMapping("/users/invite")
    public ApiResponse<UserMember> inviteUser(@RequestBody UserMember member) {
        member.setStatus("Invited");
        member.setLastLogin("Never");
        return ApiResponse.success(userMemberRepository.save(member));
    }

    @PostMapping("/users/{id}/resend")
    public ApiResponse<UserMember> resendInvite(@PathVariable UUID id) {
        return userMemberRepository.findById(id)
                .map(m -> {
                    m.setStatus("Invited");
                    return ApiResponse.success(userMemberRepository.save(m));
                })
                .orElse(ApiResponse.error("User member not found"));
    }

    @DeleteMapping("/users/{id}")
    public ApiResponse<String> deleteUser(@PathVariable UUID id) {
        userMemberRepository.deleteById(id);
        return ApiResponse.success("User member removed successfully");
    }

    @GetMapping("/groups")
    public ApiResponse<List<UserGroup>> getGroups() {
        return ApiResponse.success(userGroupRepository.findAll());
    }

    @PostMapping("/groups")
    public ApiResponse<UserGroup> createGroup(@RequestBody UserGroup group) {
        if (group.getMemberCount() == null) {
            group.setMemberCount(0);
        }
        if (group.getBadgeInitials() == null || group.getBadgeInitials().isEmpty()) {
            String initials = "";
            String[] words = group.getName().split(" ");
            if (words.length > 0) {
                initials += words[0].substring(0, Math.min(words[0].length(), 1)).toUpperCase();
            }
            if (words.length > 1) {
                initials += words[1].substring(0, Math.min(words[1].length(), 1)).toUpperCase();
            }
            if (initials.isEmpty()) {
                initials = "GP";
            }
            group.setBadgeInitials(initials);
        }
        return ApiResponse.success(userGroupRepository.save(group));
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
