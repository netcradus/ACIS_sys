#!/bin/sh
# Real pg_dump backup of both production databases (acis, keycloak).
#
# Runs either:
#   - inside the `backup` service in docker-compose.prod.yml (scheduled), or
#   - manually against any running Postgres (see BACKUP_RESTORE.md), e.g.:
#       docker exec -e PGPASSWORD=... acis-backup-1 /scripts/backup-postgres.sh
#
# Uses PGHOST/PGPORT/PGUSER/PGPASSWORD (standard libpq env vars) so it works
# unchanged whether it's talking to the `postgres` service on the Docker
# network or a port-forwarded/local instance during a manual run. Connects as
# the admin role (acis), never acis_app, since acis_app is intentionally an
# ordinary RLS-bound role (see infra/postgres-init/01-create-app-role.sh) and
# a dump taken through it would silently miss rows outside whatever tenant
# context happened to be set — a real, dangerous, silent backup gap.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

fail() {
  echo "[backup] FAILED: $1" >&2
  exit 1
}

backup_one() {
  db="$1"
  out="$BACKUP_DIR/${db}_${TIMESTAMP}.sql.gz"
  tmp="${out}.partial"

  echo "[backup] Dumping database '$db' -> $out"
  # -F p (plain SQL) so restore only needs psql, no pg_restore version
  # coupling; --no-owner/--no-privileges so a restore doesn't fail trying to
  # GRANT/ALTER OWNER to roles that may not exist on the restore target.
  if ! pg_dump --no-owner --no-privileges --format=plain --dbname="$db" | gzip > "$tmp"; then
    rm -f "$tmp"
    fail "pg_dump of '$db' did not complete"
  fi

  # A dump that produced an (almost) empty file is worse than no backup at
  # all if it silently overwrites the last good one - refuse to keep it.
  size=$(wc -c < "$tmp")
  if [ "$size" -lt 200 ]; then
    rm -f "$tmp"
    fail "dump of '$db' is suspiciously small (${size} bytes) - refusing to save it as a backup"
  fi

  mv "$tmp" "$out"
  echo "[backup] OK: $db ($(du -h "$out" | cut -f1))"
}

backup_one "acis"
backup_one "keycloak"

echo "[backup] Applying retention: deleting backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -name '*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete

echo "[backup] Current backups:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "[backup] (none)"

echo "[backup] Done at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
