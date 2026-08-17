#!/bin/sh
# Scheduling loop for the `backup` service (docker-compose.prod.yml).
# A plain sleep-loop rather than cron: this container has exactly one job,
# and a loop is trivial to reason about/log/test compared to getting crond's
# environment, timezone, and stdout logging right inside an Alpine container.
#
# Pure arithmetic on `date -u +%H/%M/%S`, deliberately avoiding `date -d`
# free-text parsing ("today"/"tomorrow ...") - that's a GNU coreutils
# extension busybox's `date` (this image is postgres:16-alpine) does not
# support, and would silently misschedule backups instead of failing loudly.
set -eu

HOUR_UTC="${BACKUP_HOUR_UTC:-2}"
TARGET_SEC=$((HOUR_UTC * 3600))

echo "[backup] Startup: running an initial backup immediately, then daily at ${HOUR_UTC}:00 UTC"

while true; do
  /scripts/backup-postgres.sh || echo "[backup] backup run failed - will retry at the next scheduled time" >&2

  h=$(date -u +%H); m=$(date -u +%M); s=$(date -u +%S)
  # Strip any leading zero so the shell doesn't treat "08"/"09" as invalid octal.
  h=${h#0}; m=${m#0}; s=${s#0}
  h=${h:-0}; m=${m:-0}; s=${s:-0}
  now_sec=$((h * 3600 + m * 60 + s))

  if [ "$now_sec" -lt "$TARGET_SEC" ]; then
    sleep_seconds=$((TARGET_SEC - now_sec))
  else
    sleep_seconds=$((86400 - now_sec + TARGET_SEC))
  fi

  echo "[backup] Next backup in ${sleep_seconds}s (~$(( sleep_seconds / 3600 ))h)"
  sleep "$sleep_seconds"
done
