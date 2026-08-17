#!/bin/sh
# Real rollback — no rebuild, just restarts the stack on a previously-built,
# still-locally-tagged image set (acis/<service>:<git-sha>). Only works if
# the target sha's images are still present (see infra/scripts/deploy.sh —
# every deploy tags a new git-sha image but never deletes older ones; see
# `docker image prune` note in ROLLBACK.md if disk usage becomes a concern).
#
# Usage: infra/scripts/rollback.sh <git-sha>   (the short sha deploy.sh printed)
set -eu

TARGET_SHA="${1:?Usage: rollback.sh <git-sha>  (see infra/scripts/deploy-history.log for valid values)}"

cd "$(dirname "$0")/../.."

echo "[rollback] Verifying images exist for ${TARGET_SHA}..."
missing=0
for svc in frontend ai-service keycloak gateway alerts log-service correlation ingestion soar asset-service platform-admin threat-service; do
  if ! docker image inspect "acis/${svc}:${TARGET_SHA}" >/dev/null 2>&1; then
    echo "[rollback] MISSING: acis/${svc}:${TARGET_SHA}" >&2
    missing=1
  fi
done
if [ "$missing" -eq 1 ]; then
  echo "[rollback] FAILED: one or more images for ${TARGET_SHA} are no longer available locally." >&2
  echo "[rollback] A rollback can only restart what's still built — it cannot resurrect a pruned image." >&2
  exit 1
fi

export IMAGE_TAG="$TARGET_SHA"

echo "[rollback] Restarting stack on ${TARGET_SHA} (no rebuild)..."
docker compose -f docker-compose.prod.yml up -d --no-build

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ROLLBACK  ${TARGET_SHA}" >> infra/scripts/deploy-history.log

echo "[rollback] Done. Now running: ${TARGET_SHA}"
echo "[rollback] Remember: IMAGE_TAG=${TARGET_SHA} is only exported in THIS shell session."
echo "[rollback] The next plain 'docker compose up -d' (without IMAGE_TAG set) will fall back to :latest — run deploy.sh"
echo "[rollback] again once you've fixed forward, don't leave the stack pinned to this rollback indefinitely by accident."
