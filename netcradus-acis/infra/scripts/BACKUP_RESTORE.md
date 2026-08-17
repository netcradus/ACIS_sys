# Postgres Backup & Restore

## How backups work

The `backup` service in `docker-compose.prod.yml` runs continuously and:

1. On startup, immediately runs `pg_dump` against both the `acis` and
   `keycloak` databases (connecting as the `acis` superuser — the ordinary
   `acis_app`/`keycloak` roles are RLS-bound and would silently produce an
   incomplete dump).
2. Writes each as a timestamped, gzip-compressed plain-SQL file
   (`acis_<UTC-timestamp>.sql.gz`, `keycloak_<UTC-timestamp>.sql.gz`) to the
   `backup_data` named volume.
3. Deletes backup files older than `BACKUP_RETENTION_DAYS` (default 14).
4. Sleeps until the next `BACKUP_HOUR_UTC` (default 02:00 UTC), repeats.

A dump that comes back suspiciously small (under 200 bytes — i.e. pg_dump
produced essentially nothing) is treated as a failure and discarded rather
than silently replacing the last good backup.

Backups are plain SQL (`pg_dump --format=plain`), not the custom/directory
format, so restoring only ever needs `psql` — no version-coupled `pg_restore`
binary to worry about matching.

## Getting a backup off the VM (do this — a backup that only exists on the
same disk as the database is not a real disaster-recovery backup)

The `backup_data` volume is local to the Docker host. Copy files out
regularly with whatever off-site storage you use, e.g.:

```bash
# From the host, one-off or via your own cron/systemd timer:
docker run --rm -v acis_backup_data:/backups -v /path/on/host:/dest alpine \
  cp -a /backups/. /dest/
# then sync /path/on/host to S3/Backblaze/another host/etc. with your
# existing tooling — that last-mile sync is infra-specific and intentionally
# not hardcoded here.
```

## Restoring — always into a NEW database first, never in place

`infra/scripts/restore-postgres.sh <dump.sql.gz> <target-db-name> [--force]`

1. Copy the desired `*.sql.gz` file to wherever you're running the restore
   from (or exec into the `postgres` or `backup` container, which already
   has the file on `backup_data`/can reach `postgres` on the network).
2. Restore into a **new, disposable** database name — never `acis` or
   `keycloak` directly:
   ```bash
   docker exec -e PGPASSWORD=<POSTGRES_ADMIN_PASSWORD> \
     <postgres-or-backup-container> \
     /scripts/restore-postgres.sh /backups/acis_20260101T020000Z.sql.gz acis_restore_check
   ```
   (`restore-postgres.sh` refuses to target `acis`/`keycloak` without
   `--force` for exactly this reason.)
3. **Verify** the restored data before trusting it — connect to
   `acis_restore_check` and spot-check row counts / recent rows against
   what you expect:
   ```bash
   psql -h postgres -U acis -d acis_restore_check -c "SELECT count(*) FROM alerts;"
   psql -h postgres -U acis -d acis_restore_check -c "SELECT count(*) FROM assets;"
   ```
4. Only once verified, perform the real cutover as a deliberate, separate
   step during a maintenance window:
   ```bash
   docker compose -f docker-compose.prod.yml stop $(docker compose -f docker-compose.prod.yml config --services | grep -v -E '^(postgres|backup)$')
   docker exec -e PGPASSWORD=<POSTGRES_ADMIN_PASSWORD> <postgres-container> \
     psql -U acis -d postgres -c "ALTER DATABASE acis RENAME TO acis_pre_restore_$(date -u +%Y%m%dT%H%M%SZ)"
   docker exec -e PGPASSWORD=<POSTGRES_ADMIN_PASSWORD> <postgres-container> \
     psql -U acis -d postgres -c "ALTER DATABASE acis_restore_check RENAME TO acis"
   docker compose -f docker-compose.prod.yml start
   ```
   Renaming the old `acis` aside instead of dropping it means a botched
   cutover is itself still recoverable.

## Verified: this procedure was tested end-to-end

Tested against the local dev Postgres instance (not production, and without
touching any real `acis`/`keycloak` data) on 2026-08-17:

1. Ran `backup-postgres.sh` against the running dev `postgres` container —
   produced real `acis_<ts>.sql.gz` / `keycloak_<ts>.sql.gz` files.
2. Ran `restore-postgres.sh <dump> acis_restore_test` (a throwaway database
   name, not `acis`) — the script created `acis_restore_test` and replayed
   the dump into it.
3. Compared `SELECT count(*)` across every table between the source `acis`
   database and the restored `acis_restore_test` database — counts matched
   exactly, confirming the dump/restore round-trip preserves all rows.
4. Dropped `acis_restore_test` afterward. The real `acis` database was never
   modified at any point in this test.

See the session's verification output for the exact commands and row-count
comparison.
