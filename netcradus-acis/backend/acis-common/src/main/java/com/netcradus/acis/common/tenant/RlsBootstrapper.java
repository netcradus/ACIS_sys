package com.netcradus.acis.common.tenant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Idempotently enables Postgres Row Level Security on a fixed set of
 * tenant-owned tables, FORCE'd so it applies even to the table-owning
 * connection role (Postgres skips RLS for the owner by default — FORCE is
 * required since every service connects as that owner).
 *
 * Call this from a CommandLineRunner ordered to run AFTER any data seeders in
 * the same service, so seed inserts happen while RLS is not yet active (no
 * tenant context needed in seeders) and only live traffic afterward is
 * subject to the policy.
 *
 * Each protected table MUST have a "tenant_id" column. Tables without one
 * (e.g. child execution-log tables that only reference a tenant-owned parent)
 * are intentionally left out of this list — they remain enforced at the
 * application layer, which already scopes them via the parent lookup.
 */
public final class RlsBootstrapper {

    private static final Logger log = LoggerFactory.getLogger(RlsBootstrapper.class);

    private RlsBootstrapper() {}

    public static void apply(JdbcTemplate jdbc, String... tenantOwnedTables) {
        for (String table : tenantOwnedTables) {
            try {
                jdbc.execute("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY");
                jdbc.execute("ALTER TABLE " + table + " FORCE ROW LEVEL SECURITY");
                jdbc.execute("DROP POLICY IF EXISTS tenant_isolation ON " + table);
                jdbc.execute("CREATE POLICY tenant_isolation ON " + table +
                        " USING (tenant_id::text = current_setting('app.current_tenant_id', true))" +
                        " WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true))");
                log.info("Row Level Security enabled on table '{}'", table);
            } catch (Exception e) {
                log.error("Failed to enable Row Level Security on table '{}': {}", table, e.getMessage(), e);
                throw e;
            }
        }
    }
}
