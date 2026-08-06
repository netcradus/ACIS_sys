package com.netcradus.acis.soar.service;

import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.soar.model.AgentEnrollmentToken;
import com.netcradus.acis.soar.repository.AgentEnrollmentTokenRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.UUID;

/**
 * Real per-tenant install-key issuance (see AgentEnrollmentToken's Javadoc
 * for why the raw value is persisted, unlike ApiKey/Invitation) plus the
 * heartbeat write path a real install.ps1/install.sh/install-mac.sh/k8s
 * DaemonSet actually calls into.
 */
@Service
@RequiredArgsConstructor
public class AgentEnrollmentService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final String CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    /** A heartbeat missing two consecutive 60s ticks reads as OFFLINE rather than a fleeting network blip. */
    private static final long ONLINE_WINDOW_SECONDS = 150;

    private final AgentEnrollmentTokenRepository tokenRepository;
    private final JdbcTemplate jdbcTemplate;

    public static class InvalidAgentTokenException extends RuntimeException {
        public InvalidAgentTokenException(String message) {
            super(message);
        }
    }

    @Transactional
    public AgentEnrollmentToken getOrCreate(UUID tenantId) {
        return tokenRepository.findByTenantId(tenantId).orElseGet(() -> issueNew(tenantId));
    }

    @Transactional
    public AgentEnrollmentToken regenerate(UUID tenantId) {
        AgentEnrollmentToken token = tokenRepository.findByTenantId(tenantId).orElseGet(() -> {
            AgentEnrollmentToken fresh = new AgentEnrollmentToken();
            fresh.setTenantId(tenantId);
            return fresh;
        });
        String raw = generateToken();
        token.setRawToken(raw);
        token.setTokenHash(hashToken(raw));
        return tokenRepository.save(token);
    }

    private AgentEnrollmentToken issueNew(UUID tenantId) {
        AgentEnrollmentToken token = new AgentEnrollmentToken();
        token.setTenantId(tenantId);
        String raw = generateToken();
        token.setRawToken(raw);
        token.setTokenHash(hashToken(raw));
        return tokenRepository.save(token);
    }

    public boolean isOnline(OffsetDateTime lastHeartbeatAt) {
        return lastHeartbeatAt != null
                && lastHeartbeatAt.isAfter(OffsetDateTime.now().minusSeconds(ONLINE_WINDOW_SECONDS));
    }

    public record HeartbeatRequest(String agentId, String hostname, String os, String ipAddress, String agentVersion) {}

    /**
     * Resolves the raw token -> tenant (bypass RLS lookup, exactly like
     * InvitationService.findValid), then upserts the AgentEndpoint row via
     * raw JDBC on one explicitly-held Connection — see InvitationService's
     * class Javadoc for why: Open-Session-In-View pins the whole request to
     * whichever physical connection was checked out first (here, the bypass
     * lookup's), so a later JPA repository call in the same request would
     * silently run against that same connection's stale tenant GUC (empty,
     * bypass-only) instead of the tenant this heartbeat actually belongs to.
     */
    public void recordHeartbeat(String rawToken, HeartbeatRequest req) {
        if (req.agentId() == null || req.agentId().isBlank()) {
            throw new InvalidAgentTokenException("agentId is required");
        }
        String hash = hashToken(rawToken);
        UUID tenantId;
        try {
            TenantContext.setAgentTokenLookupInProgress(true);
            tenantId = tokenRepository.findByTokenHash(hash).map(AgentEnrollmentToken::getTenantId).orElse(null);
        } finally {
            TenantContext.setAgentTokenLookupInProgress(false);
        }
        if (tenantId == null) {
            throw new InvalidAgentTokenException("Invalid or unknown enrollment token");
        }

        final UUID resolvedTenantId = tenantId;
        jdbcTemplate.execute((Connection connection) -> {
            setTenantGuc(connection, resolvedTenantId);
            upsertEndpoint(connection, resolvedTenantId, req);
            return null;
        });
    }

    private void setTenantGuc(Connection connection, UUID tenantId) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement("SELECT set_config('app.current_tenant_id', ?, false)")) {
            ps.setString(1, tenantId.toString());
            ps.execute();
        }
    }

    private void upsertEndpoint(Connection connection, UUID tenantId, HeartbeatRequest req) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO agent_endpoints (id, tenant_id, agent_id, hostname, os, ip_address, agent_version, first_seen_at, last_heartbeat_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, now(), now()) " +
                "ON CONFLICT (tenant_id, agent_id) DO UPDATE SET " +
                "hostname = EXCLUDED.hostname, os = EXCLUDED.os, ip_address = EXCLUDED.ip_address, " +
                "agent_version = EXCLUDED.agent_version, last_heartbeat_at = now()")) {
            ps.setObject(1, UUID.randomUUID());
            ps.setObject(2, tenantId);
            ps.setString(3, req.agentId());
            ps.setString(4, req.hostname());
            ps.setString(5, req.os());
            ps.setString(6, req.ipAddress());
            ps.setString(7, req.agentVersion());
            ps.executeUpdate();
        }
    }

    private String generateToken() {
        StringBuilder sb = new StringBuilder("acis_agent_");
        for (int i = 0; i < 40; i++) {
            sb.append(CHARS.charAt(SECURE_RANDOM.nextInt(CHARS.length())));
        }
        return sb.toString();
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
