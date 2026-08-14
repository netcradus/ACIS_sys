package com.netcradus.acis.soar.service;

import com.netcradus.acis.soar.model.AuditEntry;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers AuditEventConsumer.computeHash — the real tamper-evidence
 * calculation every audit_entries row's hash/prevHash chain depends on.
 * A bug here would silently defeat the whole point of hash-chaining: either
 * two different real events colliding on the same hash, or the same event
 * hashing differently depending on when it's recomputed (which would make
 * ComplianceService.verifyAuditChain report every legitimate row as broken).
 */
class AuditEventConsumerTest {

    private static AuditEntry entry(UUID tenantId, String timestamp, String user, String action,
                                     String resource, String ip, String status) {
        AuditEntry e = new AuditEntry();
        e.setTenantId(tenantId);
        e.setTimestamp(timestamp);
        e.setUser(user);
        e.setAction(action);
        e.setResource(resource);
        e.setIp(ip);
        e.setStatus(status);
        return e;
    }

    private static final UUID TENANT = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final String GENESIS = "0".repeat(64);

    @Test
    void sameContentAlwaysProducesTheSameHash() {
        AuditEntry a = entry(TENANT, "2026-01-01T00:00:00Z", "alice", "LOGIN", "session/1", "10.0.0.1", "SUCCESS");
        AuditEntry b = entry(TENANT, "2026-01-01T00:00:00Z", "alice", "LOGIN", "session/1", "10.0.0.1", "SUCCESS");

        assertThat(AuditEventConsumer.computeHash(GENESIS, a))
                .isEqualTo(AuditEventConsumer.computeHash(GENESIS, b));
    }

    @Test
    void isARealSha256Digest() {
        AuditEntry e = entry(TENANT, "2026-01-01T00:00:00Z", "alice", "LOGIN", "session/1", "10.0.0.1", "SUCCESS");
        String hash = AuditEventConsumer.computeHash(GENESIS, e);

        assertThat(hash).hasSize(64).matches("^[0-9a-f]{64}$");
    }

    @Test
    void changingAnyRealFieldChangesTheHash() {
        AuditEntry base = entry(TENANT, "2026-01-01T00:00:00Z", "alice", "LOGIN", "session/1", "10.0.0.1", "SUCCESS");
        String baseHash = AuditEventConsumer.computeHash(GENESIS, base);

        AuditEntry tamperedStatus = entry(TENANT, "2026-01-01T00:00:00Z", "alice", "LOGIN", "session/1", "10.0.0.1", "FAILURE");
        AuditEntry tamperedUser = entry(TENANT, "2026-01-01T00:00:00Z", "mallory", "LOGIN", "session/1", "10.0.0.1", "SUCCESS");
        AuditEntry tamperedIp = entry(TENANT, "2026-01-01T00:00:00Z", "alice", "LOGIN", "session/1", "203.0.113.9", "SUCCESS");

        assertThat(AuditEventConsumer.computeHash(GENESIS, tamperedStatus)).isNotEqualTo(baseHash);
        assertThat(AuditEventConsumer.computeHash(GENESIS, tamperedUser)).isNotEqualTo(baseHash);
        assertThat(AuditEventConsumer.computeHash(GENESIS, tamperedIp)).isNotEqualTo(baseHash);
    }

    @Test
    void chainingThroughDifferentPrevHashesChangesTheResult() {
        AuditEntry e = entry(TENANT, "2026-01-01T00:00:00Z", "alice", "LOGIN", "session/1", "10.0.0.1", "SUCCESS");

        String fromGenesis = AuditEventConsumer.computeHash(GENESIS, e);
        String fromDifferentPrev = AuditEventConsumer.computeHash("f".repeat(64), e);

        // Same event content, different chain position - proves an attacker
        // can't splice a real, untouched row into a different point in the
        // chain and have it verify: its hash is bound to what came before it.
        assertThat(fromGenesis).isNotEqualTo(fromDifferentPrev);
    }
}
