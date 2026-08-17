#!/bin/sh
# Restores one gzipped SQL dump (produced by backup-postgres.sh) into a
# target database. See BACKUP_RESTORE.md for the full documented procedure.
#
# Usage:
#   restore-postgres.sh <path-to-dump.sql.gz> <target-db-name> [--force]
#
# Safety: refuses to restore over the live "acis" or "keycloak" databases
# unless --force is passed, since a restore is a destructive overwrite of
# whatever is currently in the target database (DROP-then-recreate objects
# as the dump replays). The documented procedure always restores into a
# freshly created database first, verifies it, then only swaps it in for
# the real one as a separate, deliberate step - never a silent in-place
# overwrite.
set -eu

DUMP_FILE="${1:?Usage: restore-postgres.sh <dump.sql.gz> <target-db-name> [--force]}"
TARGET_DB="${2:?Usage: restore-postgres.sh <dump.sql.gz> <target-db-name> [--force]}"
FORCE="${3:-}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "[restore] FAILED: dump file not found: $DUMP_FILE" >&2
  exit 1
fi

case "$TARGET_DB" in
  acis|keycloak)
    if [ "$FORCE" != "--force" ]; then
      echo "[restore] REFUSING: '$TARGET_DB' is a live production database name." >&2
      echo "[restore] Restore into a new database (e.g. '${TARGET_DB}_restore') and verify it first." >&2
      echo "[restore] Only pass --force if you have already stopped every service using '$TARGET_DB' and intend a real in-place overwrite." >&2
      exit 1
    fi
    echo "[restore] --force given: proceeding with an IN-PLACE restore over '$TARGET_DB'." >&2
    ;;
esac

echo "[restore] Creating/verifying target database '$TARGET_DB' exists..."
psql -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB'" | grep -q 1 \
  || psql -d postgres -c "CREATE DATABASE \"$TARGET_DB\""

echo "[restore] Restoring $DUMP_FILE into '$TARGET_DB'..."
gunzip -c "$DUMP_FILE" | psql -v ON_ERROR_STOP=1 -d "$TARGET_DB"

echo "[restore] OK. Verify row counts / spot-check data in '$TARGET_DB' before treating this restore as trusted."
