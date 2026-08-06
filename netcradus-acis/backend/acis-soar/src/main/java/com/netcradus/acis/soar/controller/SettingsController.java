package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.common.apikey.ApiKey;
import com.netcradus.acis.common.apikey.ApiKeyRepository;
import com.netcradus.acis.soar.model.Integration;
import com.netcradus.acis.soar.model.Organization;
import com.netcradus.acis.soar.model.LicenseDetails;
import com.netcradus.acis.soar.model.Invoice;
import com.netcradus.acis.common.rbac.UserMember;
import com.netcradus.acis.common.rbac.UserGroup;
import com.netcradus.acis.common.rbac.ConsoleRole;
import com.netcradus.acis.common.rbac.RolePermission;
import com.netcradus.acis.soar.dto.ApiKeyCreatedResponse;
import com.netcradus.acis.soar.repository.IntegrationRepository;
import com.netcradus.acis.soar.repository.OrganizationRepository;
import com.netcradus.acis.soar.repository.LicenseDetailsRepository;
import com.netcradus.acis.soar.repository.InvoiceRepository;
import com.netcradus.acis.common.rbac.UserMemberRepository;
import com.netcradus.acis.common.rbac.UserGroupRepository;
import com.netcradus.acis.common.rbac.ConsoleRoleRepository;
import com.netcradus.acis.common.rbac.RolePermissionRepository;
import com.netcradus.acis.common.rbac.DefaultRoleProvisioner;
import com.netcradus.acis.common.rbac.PermissionResolver;
import com.netcradus.acis.common.rbac.PermissionLevel;
import com.netcradus.acis.soar.service.InvitationService;
import com.netcradus.acis.soar.service.AgentEnrollmentService;
import com.netcradus.acis.soar.model.AgentEndpoint;
import com.netcradus.acis.soar.model.AgentEnrollmentToken;
import com.netcradus.acis.soar.repository.AgentEndpointRepository;
import com.netcradus.acis.soar.repository.AgentPolicyRepository;
import com.netcradus.acis.soar.model.AgentPolicy;
import lombok.RequiredArgsConstructor;
import java.util.ArrayList;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/soar/settings")
@RequiredArgsConstructor
public class SettingsController {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[\\w.+-]+@[\\w-]+\\.[a-zA-Z]{2,}$");

    private final ApiKeyRepository apiKeyRepository;
    private final IntegrationRepository integrationRepository;
    private final OrganizationRepository organizationRepository;
    private final LicenseDetailsRepository licenseDetailsRepository;
    private final InvoiceRepository invoiceRepository;
    private final UserMemberRepository userMemberRepository;
    private final UserGroupRepository userGroupRepository;
    private final ConsoleRoleRepository consoleRoleRepository;
    private final RolePermissionRepository rolePermissionRepository;
    private final AuditEventPublisher auditEventPublisher;
    private final com.netcradus.acis.soar.support.ApiKeyIssuer apiKeyIssuer;
    private final DefaultRoleProvisioner defaultRoleProvisioner;
    private final PermissionResolver permissionResolver;
    private final InvitationService invitationService;
    private final AgentEnrollmentService agentEnrollmentService;
    private final AgentEndpointRepository agentEndpointRepository;
    private final AgentPolicyRepository agentPolicyRepository;

    /**
     * X-Tenant-ID is always populated by TenantContextFilter from the caller's
     * validated JWT tenant_id claim for any authenticated request — there is no
     * "demo tenant" fallback, since that fallback previously let requests bleed
     * into a shared tenant whenever a caller omitted the header.
     */
    private UUID resolveTenant(UUID tenantId) {
        if (tenantId == null) {
            throw new IllegalStateException("X-Tenant-ID missing; request should have been rejected upstream");
        }
        return tenantId;
    }

    // ── API Keys ──────────────────────────────────────────────

    @GetMapping("/keys")
    public ApiResponse<List<ApiKey>> getKeys(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return ApiResponse.success(apiKeyRepository.findByTenantId(resolveTenant(tenantId)));
    }

    @PostMapping("/keys")
    public ResponseEntity<ApiResponse<ApiKeyCreatedResponse>> generateKey(@RequestBody ApiKey key,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        if (key.getKeyName() == null || key.getKeyName().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Key name is required"));
        }
        var issued = apiKeyIssuer.issue(resolveTenant(tenantId), key.getKeyName(), key.getRole());
        auditEventPublisher.publish("API_KEY_CREATE", "api-key/" + issued.key().getId(), "created");
        // rawToken is returned here only — it was never persisted, so this response
        // is the one and only time the caller can see the real secret.
        return ResponseEntity.ok(ApiResponse.success(new ApiKeyCreatedResponse(issued.key(), issued.rawToken())));
    }

    @PutMapping("/keys/{id}/revoke")
    public ResponseEntity<ApiResponse<ApiKey>> revokeKey(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return apiKeyRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(k -> {
                    k.setStatus("Revoked");
                    ApiKey saved = apiKeyRepository.save(k);
                    auditEventPublisher.publish("API_KEY_REVOKE", "api-key/" + id, "revoked");
                    return ResponseEntity.ok(ApiResponse.success(saved));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Key not found")));
    }

    @DeleteMapping("/keys/{id}")
    public ResponseEntity<ApiResponse<String>> deleteKey(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return apiKeyRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(k -> {
                    apiKeyRepository.delete(k);
                    auditEventPublisher.publish("API_KEY_DELETE", "api-key/" + id, "deleted");
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
        Integration saved = integrationRepository.save(integration);
        auditEventPublisher.publish("INTEGRATION_CREATE", "integration/" + saved.getId(), "created");
        return ResponseEntity.ok(ApiResponse.success(saved));
    }

    @PutMapping("/integrations/{id}/toggle")
    public ResponseEntity<ApiResponse<Integration>> toggleIntegration(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return integrationRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(i -> {
                    i.setStatus("Connected".equals(i.getStatus()) ? "Disconnected" : "Connected");
                    Integration saved = integrationRepository.save(i);
                    auditEventPublisher.publish("INTEGRATION_TOGGLE", "integration/" + id, "status=" + saved.getStatus());
                    return ResponseEntity.ok(ApiResponse.success(saved));
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
        Organization saved = organizationRepository.save(orgToUpdate);
        auditEventPublisher.publish("ORGANIZATION_UPDATE", "organization/" + saved.getId(), "updated");
        return ApiResponse.success(saved);
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
                    auditEventPublisher.publish("ORGANIZATION_TRANSFER_OWNERSHIP", "organization/" + org.getId(), "new_owner=" + email);
                    return ResponseEntity.ok(ApiResponse.success("Organization ownership successfully transferred to " + email));
                })
                .orElseGet(() -> ResponseEntity.badRequest()
                        .body(ApiResponse.error("No member with that email exists in this organization — invite them first")));
    }

    @DeleteMapping("/organization")
    public ApiResponse<String> deleteOrganization(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        organizationRepository.deleteAll(organizationRepository.findByTenantId(resolveTenant(tenantId)));
        auditEventPublisher.publish("ORGANIZATION_DELETE", "organization", "deleted");
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
        LicenseDetails saved = licenseDetailsRepository.save(ld);
        auditEventPublisher.publish("LICENSE_CHANGE_PLAN", "license/" + saved.getId(), "plan=" + newPlanName);
        return ApiResponse.success(saved);
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
        LicenseDetails saved = licenseDetailsRepository.save(ld);
        auditEventPublisher.publish("LICENSE_PAYMENT_METHOD_UPDATE", "license/" + saved.getId(), "updated");
        return ApiResponse.success(saved);
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

    public record InviteResponse(UserMember member, boolean emailSent, String emailError) {}

    @PostMapping("/users/invite")
    public ResponseEntity<ApiResponse<InviteResponse>> inviteUser(@RequestBody UserMember member,
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
        UserMember saved = userMemberRepository.save(member);
        // The UserMember row is real and persisted regardless of what happens
        // next — a failed send doesn't lose the invite, it just means the
        // admin needs to know so they can retry or hand the link over another
        // way (see InvitationService.IssueResult / the honest-failure note
        // in resendInvite below).
        InvitationService.IssueResult issued = invitationService.issue(saved);
        auditEventPublisher.publish("USER_INVITE", "user/" + saved.getId(),
                "email=" + email + " emailSent=" + issued.emailSent());
        return ResponseEntity.ok(ApiResponse.success(new InviteResponse(saved, issued.emailSent(), issued.emailError())));
    }

    @PostMapping("/users/{id}/resend")
    public ResponseEntity<ApiResponse<InviteResponse>> resendInvite(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return userMemberRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(m -> {
                    m.setStatus("Invited");
                    UserMember saved = userMemberRepository.save(m);
                    InvitationService.IssueResult issued = invitationService.issue(saved);
                    auditEventPublisher.publish("USER_RESEND_INVITE", "user/" + id,
                            "resent emailSent=" + issued.emailSent());
                    return ResponseEntity.ok(ApiResponse.success(new InviteResponse(saved, issued.emailSent(), issued.emailError())));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("User member not found")));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<ApiResponse<String>> deleteUser(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return userMemberRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(m -> {
                    userMemberRepository.delete(m);
                    auditEventPublisher.publish("USER_DELETE", "user/" + id, "deleted");
                    return ResponseEntity.ok(ApiResponse.success("User member removed successfully"));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("User member not found")));
    }

    @GetMapping("/groups")
    public ApiResponse<List<UserGroup>> getGroups(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        List<UserGroup> groups = userGroupRepository.findByTenantId(tenant);
        List<UserMember> members = userMemberRepository.findByTenantId(tenant);
        // Real count, computed fresh every read — memberCount is @Transient
        // now precisely so nothing can accidentally trust a stale stored
        // number again (see UserGroup's Javadoc).
        groups.forEach(g -> g.setMemberCount((int) members.stream()
                .filter(m -> m.getGroup() != null && m.getGroup().getId().equals(g.getId()))
                .count()));
        return ApiResponse.success(groups);
    }

    @PostMapping("/groups")
    public ResponseEntity<ApiResponse<UserGroup>> createGroup(@RequestBody UserGroup group,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        if (group.getName() == null || group.getName().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Group name is required"));
        }
        group.setTenantId(resolveTenant(tenantId));
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
        UserGroup saved = userGroupRepository.save(group);
        auditEventPublisher.publish("GROUP_CREATE", "group/" + saved.getId(), "created");
        saved.setMemberCount(0);
        return ResponseEntity.ok(ApiResponse.success(saved));
    }

    @DeleteMapping("/groups/{id}")
    @Transactional
    public ResponseEntity<ApiResponse<String>> deleteGroup(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        return userGroupRepository.findByIdAndTenantId(id, tenant)
                .map(group -> {
                    // Ungroup its members rather than block/cascade-delete
                    // them — losing an organizational label should never
                    // take a real account down with it.
                    userMemberRepository.findByTenantId(tenant).stream()
                            .filter(m -> m.getGroup() != null && m.getGroup().getId().equals(id))
                            .forEach(m -> { m.setGroup(null); userMemberRepository.save(m); });
                    userGroupRepository.delete(group);
                    auditEventPublisher.publish("GROUP_DELETE", "group/" + id, "deleted");
                    return ResponseEntity.ok(ApiResponse.success("Group deleted successfully"));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Group not found")));
    }

    public record AssignGroupRequest(UUID groupId) {}

    /** groupId may be null to unassign — the member then shows as "Ungrouped". */
    @PutMapping("/users/{id}/group")
    public ResponseEntity<ApiResponse<UserMember>> assignGroup(@PathVariable UUID id, @RequestBody AssignGroupRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        return userMemberRepository.findByIdAndTenantId(id, tenant)
                .map(member -> {
                    if (req.groupId() == null) {
                        member.setGroup(null);
                    } else {
                        UserGroup group = userGroupRepository.findByIdAndTenantId(req.groupId(), tenant).orElse(null);
                        if (group == null) {
                            return ResponseEntity.badRequest().body(ApiResponse.<UserMember>error("Group not found"));
                        }
                        member.setGroup(group);
                    }
                    UserMember saved = userMemberRepository.save(member);
                    auditEventPublisher.publish("USER_GROUP_ASSIGN", "user-member/" + id,
                            req.groupId() != null ? "assigned group " + req.groupId() : "ungrouped");
                    return ResponseEntity.ok(ApiResponse.success(saved));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Member not found")));
    }

    // ── Agent Deployment ──────────────────────────────────────
    //
    // Real per-tenant install key + real fleet, driven entirely by actual
    // heartbeat check-ins from install.ps1/install.sh/install-mac.sh/the k8s
    // DaemonSet (see AgentController, the public endpoint these scripts
    // actually call). No mock rows, no client-side-only "regenerate".

    public record AgentTokenResponse(String token) {}

    @GetMapping("/agent-token")
    public ApiResponse<AgentTokenResponse> getAgentToken(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        AgentEnrollmentToken token = agentEnrollmentService.getOrCreate(resolveTenant(tenantId));
        return ApiResponse.success(new AgentTokenResponse(token.getRawToken()));
    }

    @PostMapping("/agent-token/regenerate")
    public ApiResponse<AgentTokenResponse> regenerateAgentToken(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        AgentEnrollmentToken token = agentEnrollmentService.regenerate(tenant);
        auditEventPublisher.publish("AGENT_TOKEN_REGENERATE", "tenant/" + tenant, "regenerated");
        return ApiResponse.success(new AgentTokenResponse(token.getRawToken()));
    }

    public record AgentEndpointView(UUID id, String agentId, String hostname, String os, String ipAddress,
                                     String agentVersion, String status, OffsetDateTime lastHeartbeatAt, OffsetDateTime firstSeenAt) {}

    @GetMapping("/agents")
    public ApiResponse<List<AgentEndpointView>> getAgents(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        List<AgentEndpointView> views = agentEndpointRepository.findByTenantId(resolveTenant(tenantId)).stream()
                .map(a -> new AgentEndpointView(a.getId(), a.getAgentId(), a.getHostname(), a.getOs(), a.getIpAddress(),
                        a.getAgentVersion(), agentEnrollmentService.isOnline(a.getLastHeartbeatAt()) ? "ONLINE" : "OFFLINE",
                        a.getLastHeartbeatAt(), a.getFirstSeenAt()))
                .toList();
        return ApiResponse.success(views);
    }

    @DeleteMapping("/agents/{id}")
    public ResponseEntity<ApiResponse<String>> deleteAgent(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        return agentEndpointRepository.findByIdAndTenantId(id, resolveTenant(tenantId))
                .map(a -> {
                    agentEndpointRepository.delete(a);
                    auditEventPublisher.publish("AGENT_REMOVE", "agent/" + id, "removed");
                    return ResponseEntity.ok(ApiResponse.success("Agent removed from fleet"));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Agent not found")));
    }

    @GetMapping("/agent-policy")
    public ApiResponse<AgentPolicy> getAgentPolicy(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        AgentPolicy policy = agentPolicyRepository.findByTenantId(tenant).orElseGet(() -> {
            AgentPolicy fresh = new AgentPolicy();
            fresh.setTenantId(tenant);
            return agentPolicyRepository.save(fresh);
        });
        return ApiResponse.success(policy);
    }

    @PutMapping("/agent-policy")
    public ApiResponse<AgentPolicy> updateAgentPolicy(@RequestBody AgentPolicy updated,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        AgentPolicy policy = agentPolicyRepository.findByTenantId(tenant).orElseGet(() -> {
            AgentPolicy fresh = new AgentPolicy();
            fresh.setTenantId(tenant);
            return fresh;
        });
        policy.setPollRate(updated.getPollRate());
        policy.setCpuCapPercent(updated.getCpuCapPercent());
        policy.setRamCapMb(updated.getRamCapMb());
        policy.setAutoUpdate(updated.getAutoUpdate());
        policy.setTamperProtect(updated.getTamperProtect());
        AgentPolicy saved = agentPolicyRepository.save(policy);
        auditEventPublisher.publish("AGENT_POLICY_UPDATE", "tenant/" + tenant, "updated");
        return ApiResponse.success(saved);
    }

    // ── Roles & Permissions ───────────────────────────────────
    //
    // This is now genuinely enforced, not just displayed: RbacEnforcementFilter
    // (acis-common, wired into acis-alerts/correlation/log-service/asset-service/
    // threat-service/soar) resolves the caller's UserMember -> ConsoleRole ->
    // RolePermission on every request and rejects with 403 if the level is
    // insufficient. See PermissionResolver for how a user's role is resolved
    // and DefaultRoleProvisioner for the standard 4-role starter set.

    @GetMapping("/roles")
    public ApiResponse<List<ConsoleRole>> getRoles(@RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        List<ConsoleRole> roles = defaultRoleProvisioner.ensureDefaultRoles(tenant);
        roles.forEach(r -> r.setUserCount(userMemberRepository.findByTenantId(tenant).stream()
                .filter(m -> m.getRole() != null && m.getRole().getId().equals(r.getId()))
                .toList().size()));
        return ApiResponse.success(roles);
    }

    @PostMapping("/roles")
    public ResponseEntity<ApiResponse<ConsoleRole>> createRole(@RequestBody ConsoleRole role,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        if (role.getName() == null || role.getName().isBlank()) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Role name is required"));
        }
        UUID tenant = resolveTenant(tenantId);
        role.setTenantId(tenant);
        role.setUserCount(0);

        List<RolePermission> permissions = new ArrayList<>();
        for (String mod : DefaultRoleProvisioner.MODULES) {
            RolePermission perm = new RolePermission();
            perm.setTenantId(tenant);
            perm.setRole(role);
            perm.setModuleName(mod);
            perm.setPermissionLevel("NONE");
            permissions.add(perm);
        }
        role.setPermissions(permissions);

        ConsoleRole saved = consoleRoleRepository.save(role);
        auditEventPublisher.publish("ROLE_CREATE", "role/" + saved.getId(), "created");
        return ResponseEntity.ok(ApiResponse.success(saved));
    }

    @PutMapping("/roles/{id}")
    public ResponseEntity<ApiResponse<ConsoleRole>> updateRole(@PathVariable UUID id, @RequestBody ConsoleRole updatedRole,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        return consoleRoleRepository.findByIdAndTenantId(id, tenant)
                .map(existingRole -> {
                    if (updatedRole.getName() != null && !updatedRole.getName().isBlank()) {
                        existingRole.setName(updatedRole.getName());
                    }
                    if (updatedRole.getPermissions() != null) {
                        existingRole.getPermissions().clear();
                        for (RolePermission up : updatedRole.getPermissions()) {
                            RolePermission newPerm = new RolePermission();
                            newPerm.setTenantId(tenant);
                            newPerm.setRole(existingRole);
                            newPerm.setModuleName(up.getModuleName());
                            newPerm.setPermissionLevel(up.getPermissionLevel() != null ? up.getPermissionLevel() : "NONE");
                            existingRole.getPermissions().add(newPerm);
                        }
                    }
                    ConsoleRole saved = consoleRoleRepository.save(existingRole);
                    auditEventPublisher.publish("ROLE_UPDATE", "role/" + id, "updated");
                    return ResponseEntity.ok(ApiResponse.success(saved));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Role not found")));
    }

    @DeleteMapping("/roles/{id}")
    public ResponseEntity<ApiResponse<String>> deleteRole(@PathVariable UUID id,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        return consoleRoleRepository.findByIdAndTenantId(id, tenant)
                .map(role -> {
                    consoleRoleRepository.delete(role);
                    auditEventPublisher.publish("ROLE_DELETE", "role/" + id, "deleted");
                    return ResponseEntity.ok(ApiResponse.success("Role deleted successfully"));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Role not found")));
    }

    public record AssignRoleRequest(UUID roleId) {}

    /** roleId may be null to unassign — the member then falls back to deny-by-default on every module. */
    @PutMapping("/users/{id}/role")
    public ResponseEntity<ApiResponse<UserMember>> assignRole(@PathVariable UUID id, @RequestBody AssignRoleRequest req,
            @RequestHeader(value = "X-Tenant-ID", required = false) UUID tenantId) {
        UUID tenant = resolveTenant(tenantId);
        return userMemberRepository.findByIdAndTenantId(id, tenant)
                .map(member -> {
                    if (req.roleId() == null) {
                        member.setRole(null);
                    } else {
                        ConsoleRole role = consoleRoleRepository.findByIdAndTenantId(req.roleId(), tenant).orElse(null);
                        if (role == null) {
                            return ResponseEntity.badRequest().body(ApiResponse.<UserMember>error("Role not found"));
                        }
                        member.setRole(role);
                    }
                    UserMember saved = userMemberRepository.save(member);
                    auditEventPublisher.publish("USER_ROLE_ASSIGN", "user-member/" + id,
                            req.roleId() != null ? "assigned role " + req.roleId() : "unassigned role");
                    return ResponseEntity.ok(ApiResponse.success(saved));
                })
                .orElse(ResponseEntity.status(404).body(ApiResponse.error("Member not found")));
    }

    /** The caller's own resolved permission map — what the frontend gates its UI on, so it always matches what the backend will actually allow. */
    @GetMapping("/my-permissions")
    public ApiResponse<Map<String, String>> getMyPermissions() {
        Map<String, PermissionLevel> resolved = permissionResolver.resolveAll();
        Map<String, String> body = new java.util.LinkedHashMap<>();
        resolved.forEach((module, level) -> body.put(module, level.name()));
        return ApiResponse.success(body);
    }

}
