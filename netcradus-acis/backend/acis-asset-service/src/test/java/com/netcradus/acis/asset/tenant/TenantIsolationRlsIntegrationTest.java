package com.netcradus.acis.asset.tenant;

import com.netcradus.acis.common.tenant.TenantAwareDataSource;
import com.netcradus.acis.common.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Proves Postgres Row-Level Security actually isolates tenants on the real
 * {@code assets} table (enabled/forced by
 * {@code RlsConfig.enableAssetsRowLevelSecurity}), exercised through the
 * exact production code path: {@link TenantAwareDataSource} sets
 * {@code app.current_tenant_id} on every connection checkout from whatever
 * {@link TenantContext#getTenantId()} currently holds, and the
 * {@code tenant_isolation} policy on {@code assets} filters every
 * SELECT/INSERT/UPDATE/DELETE by it.
 *
 * This is deliberately NOT a mocked repository test — a mock can only prove
 * the service code passed a tenant id somewhere, never that Postgres itself
 * enforces the boundary. This opens a real JDBC connection to the same
 * Postgres instance this project's own manual dev testing has used all
 * session (localhost:15432, db "acis", role "acis_app" — see
 * acis-asset-service/src/main/resources/application.yml; these are the
 * project's own committed dev-only fixtures, not secrets, and the role is
 * deliberately not the "acis" bootstrap superuser, since RLS never applies
 * to superusers).
 *
 * Test data uses randomly-generated, obviously-synthetic tenant ids
 * (never colliding with any real tenant) and is deleted in
 * {@link #tearDown()} regardless of outcome, so this leaves no residue in
 * the shared dev database.
 *
 * If no Postgres is reachable at that address (e.g. a CI box with no local
 * dev stack running), the test is skipped via {@link org.junit.jupiter.api.Assumptions}
 * rather than failed — it can only prove anything when it can actually reach
 * a real RLS-enabled database.
 */
class TenantIsolationRlsIntegrationTest {

    // Matches application.yml's own datasource URL exactly, including the
    // forced UTC timezone option — without it the Postgres JDBC driver
    // derives the session TimeZone GUC from the JVM's default zone id, and
    // on a JVM whose default is the deprecated "Asia/Calcutta" alias
    // (rather than "Asia/Kolkata"), Postgres rejects it outright
    // (FATAL: invalid value for parameter "TimeZone") before RLS is ever
    // reached.
    private static final String DB_URL = "jdbc:postgresql://" + env("DB_HOST", "localhost")
            + ":" + env("DB_PORT", "15432") + "/" + env("DB_NAME", "acis") + "?options=-c%20timezone=UTC";
    private static final String DB_USER = env("DB_USER", "acis_app");
    private static final String DB_PASSWORD = env("DB_PASSWORD", "acis_app_dev_password");

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return (v == null || v.isBlank()) ? def : v;
    }

    static {
        // Belt-and-suspenders alongside the URL's own "?options=-c timezone=UTC":
        // pgjdbc's startup handshake also sends the JVM's default TimeZone id
        // independently, and on a JVM whose default is the deprecated
        // "Asia/Calcutta" alias (not the modern "Asia/Kolkata"), Postgres
        // rejects that value outright before any query runs. Production's
        // AcisAssetApplication.main() sets this explicitly for the same
        // reason (TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"))),
        // but that only runs via main() - not under a test JVM - so this test
        // sets its own equivalent.
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
    }

    private DataSource tenantAwareDataSource;
    private final String tenantA = "rls-it-tenant-a-" + UUID.randomUUID();
    private final String tenantB = "rls-it-tenant-b-" + UUID.randomUUID();
    private String assetAId;
    private String assetBId;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource real = new DriverManagerDataSource(DB_URL, DB_USER, DB_PASSWORD);
        real.setDriverClassName("org.postgresql.Driver");
        try (Connection probe = real.getConnection()) {
            // reachable — proceed
        } catch (Exception e) {
            assumeTrue(false, "Local dev Postgres not reachable at " + DB_URL
                    + " — skipping real-RLS integration test (" + e.getMessage() + ")");
        }
        tenantAwareDataSource = new TenantAwareDataSource(real);
        assetAId = insertAsset(tenantA, "rls-test-asset-a");
        assetBId = insertAsset(tenantB, "rls-test-asset-b");
    }

    @AfterEach
    void tearDown() {
        if (tenantAwareDataSource == null) {
            return; // setUp's assumeTrue skipped before creating anything
        }
        deleteAsset(tenantA, assetAId);
        deleteAsset(tenantB, assetBId);
    }

    private String insertAsset(String tenantId, String name) {
        String id = UUID.randomUUID().toString();
        TenantContext.setTenantId(tenantId);
        try (Connection c = tenantAwareDataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "INSERT INTO assets (id, tenant_id, name, ip_address, type, status) VALUES (?,?,?,?,?,?)")) {
            ps.setString(1, id);
            ps.setString(2, tenantId);
            ps.setString(3, name);
            ps.setString(4, "10.0.0.1");
            ps.setString(5, "SERVER");
            ps.setString(6, "ACTIVE");
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to seed test asset for " + tenantId, e);
        } finally {
            TenantContext.clear();
        }
        return id;
    }

    private void deleteAsset(String tenantId, String id) {
        if (id == null) {
            return;
        }
        TenantContext.setTenantId(tenantId);
        try (Connection c = tenantAwareDataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("DELETE FROM assets WHERE id = ?")) {
            ps.setString(1, id);
            ps.executeUpdate();
        } catch (SQLException ignored) {
            // Best-effort cleanup only.
        } finally {
            TenantContext.clear();
        }
    }

    private List<String> visibleNamesAmong(String tenantId, String... ids) throws SQLException {
        TenantContext.setTenantId(tenantId);
        try (Connection c = tenantAwareDataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT name FROM assets WHERE id IN (?, ?)")) {
            ps.setString(1, ids[0]);
            ps.setString(2, ids[1]);
            try (ResultSet rs = ps.executeQuery()) {
                List<String> names = new ArrayList<>();
                while (rs.next()) {
                    names.add(rs.getString(1));
                }
                return names;
            }
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    void tenantACanReadItsOwnRowAndNotTenantBs() throws SQLException {
        List<String> visible = visibleNamesAmong(tenantA, assetAId, assetBId);
        assertThat(visible).containsExactly("rls-test-asset-a");
    }

    @Test
    void tenantBCanReadItsOwnRowAndNotTenantAs() throws SQLException {
        List<String> visible = visibleNamesAmong(tenantB, assetAId, assetBId);
        assertThat(visible).containsExactly("rls-test-asset-b");
    }

    @Test
    void crossTenantReadByExactIdReturnsEmptyNotAnException() throws SQLException {
        // Tenant A explicitly querying tenant B's row by primary key gets zero
        // rows back, not a 403/exception — this is how Postgres RLS actually
        // behaves (a filtered SELECT, not a denied one).
        TenantContext.setTenantId(tenantA);
        try (Connection c = tenantAwareDataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT name FROM assets WHERE id = ?")) {
            ps.setString(1, assetBId);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).as("tenant A must see zero rows for tenant B's asset id").isFalse();
            }
        } finally {
            TenantContext.clear();
        }

        TenantContext.setTenantId(tenantB);
        try (Connection c = tenantAwareDataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT name FROM assets WHERE id = ?")) {
            ps.setString(1, assetAId);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).as("tenant B must see zero rows for tenant A's asset id").isFalse();
            }
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    void noTenantContextSetSeesNoRowsFailClosedNotFailOpen() throws SQLException {
        // TenantContext never set (equivalent to TenantContextFilter never
        // running, e.g. a request with no tenant_id claim) -> TenantAwareDataSource
        // sets app.current_tenant_id to "" -> matches no tenant's rows at all.
        TenantContext.clear();
        try (Connection c = tenantAwareDataSource.getConnection();
             PreparedStatement ps = c.prepareStatement("SELECT name FROM assets WHERE id IN (?, ?)")) {
            ps.setString(1, assetAId);
            ps.setString(2, assetBId);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).as("no tenant context must see zero rows, not every tenant's rows").isFalse();
            }
        }
    }

    @Test
    void tenantCannotInsertARowTaggedAsAnotherTenant() throws SQLException {
        // WITH CHECK enforcement: connected as tenant A, attempting to INSERT
        // a row whose tenant_id names tenant B must be rejected by Postgres
        // itself, not merely by application code that happens to behave.
        TenantContext.setTenantId(tenantA);
        try (Connection c = tenantAwareDataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                     "INSERT INTO assets (id, tenant_id, name, ip_address, type, status) VALUES (?,?,?,?,?,?)")) {
            ps.setString(1, UUID.randomUUID().toString());
            ps.setString(2, tenantB);
            ps.setString(3, "should-be-rejected-by-rls");
            ps.setString(4, "10.0.0.2");
            ps.setString(5, "SERVER");
            ps.setString(6, "ACTIVE");
            assertThatThrownBy(ps::executeUpdate)
                    .as("INSERT tagged with a different tenant than the session's app.current_tenant_id must violate WITH CHECK")
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("row-level security");
        } finally {
            TenantContext.clear();
        }
    }
}
