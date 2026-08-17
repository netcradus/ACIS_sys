#!/bin/sh
# Real, versioned production deploy — replaces a bare
# `docker compose -f docker-compose.prod.yml up -d --build` (which always
# overwrites the same ":latest" image, leaving no way to tell which commit
# is actually running or to go back to the previous one).
#
# What it does:
#   1. Builds every service, tagged as acis/<service>:<git-sha> (see the
#      `image:` line added to each service in docker-compose.prod.yml).
#   2. Also re-tags each as acis/<service>:latest, purely for convenience
#      (so a plain `docker compose up -d --build` with no IMAGE_TAG set
#      still works exactly as it always has).
#   3. Starts the stack running the just-built <git-sha> images specifically
#      (not "whatever :latest happens to resolve to" — see IMAGE_TAG below).
#   4. Appends a line to deploy-history.log recording exactly which commit
#      is now live and when — the thing to check "what's deployed right
#      now" and what to roll back to.
#
# Requires a clean git checkout of the commit you intend to deploy (run
# from the repo root, on the VM, after `git pull`/`git checkout <ref>`).
set -eu

cd "$(dirname "$0")/../.."

if ! git diff --quiet HEAD 2>/dev/null || ! git diff --cached --quiet HEAD 2>/dev/null; then
  echo "[deploy] REFUSING: working tree has uncommitted changes. Commit or stash them first —" >&2
  echo "[deploy] a deploy must correspond to a real, identifiable commit for rollback to mean anything." >&2
  exit 1
fi

GIT_SHA=$(git rev-parse --short=12 HEAD)
export IMAGE_TAG="$GIT_SHA"

PREVIOUS_SHA=$(tail -n 1 infra/scripts/deploy-history.log 2>/dev/null | awk '{print $3}' || true)

echo "[deploy] Deploying commit $GIT_SHA"

docker compose -f docker-compose.prod.yml build

echo "[deploy] Also tagging every image as :latest for convenience..."
for svc in frontend ai-service keycloak gateway alerts log-service correlation ingestion soar asset-service platform-admin threat-service; do
  docker tag "acis/${svc}:${GIT_SHA}" "acis/${svc}:latest"
done

echo "[deploy] Rendering infra/monitoring/alertmanager.yml from its template..."
sh infra/scripts/render-alertmanager-config.sh

docker compose -f docker-compose.prod.yml up -d

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) DEPLOY  ${GIT_SHA}  $(git log -1 --format='%s' "$GIT_SHA" 2>/dev/null | head -c 100)" >> infra/scripts/deploy-history.log

echo "[deploy] Done. Now running: ${GIT_SHA}"
if [ -n "${PREVIOUS_SHA:-}" ]; then
  echo "[deploy] If this deploy needs to be rolled back: infra/scripts/rollback.sh ${PREVIOUS_SHA}"
fi
