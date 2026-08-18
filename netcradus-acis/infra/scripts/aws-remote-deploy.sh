#!/bin/bash
# Runs ON the EC2 app host (via SSM Send-Command, see deploy-to-aws.sh -
# never invoked directly). Expects S3_BUCKET, SECRET_ARN, RDS_ADDRESS,
# REGION as env vars.
set -euo pipefail

echo "[remote-deploy] Waiting for instance bootstrap (Docker install) to finish..."
for i in $(seq 1 30); do
  [ -f /opt/acis/bootstrap.done ] && break
  sleep 10
done
[ -f /opt/acis/bootstrap.done ] || { echo "[remote-deploy] FAILED: bootstrap never completed"; exit 1; }

echo "[remote-deploy] Fetching application code..."
rm -rf /opt/acis/app
mkdir -p /opt/acis/app
aws s3 cp "s3://${S3_BUCKET}/deploys/repo.tar.gz" /tmp/repo.tar.gz --region "$REGION"
tar -xzf /tmp/repo.tar.gz -C /opt/acis/app
cd /opt/acis/app

# Defensive: whatever step in the Windows-authored packaging pipeline
# introduces it, every shell script needs real LF line endings - a CRLF
# `set -e\r` line is invalid syntax to bash ("set: -e^M: invalid
# option"), found running this for real (first against the
# postgres-init scripts, then again against render-alertmanager-config.sh -
# not a one-off, so normalize every .sh file up front rather than
# whack-a-mole fixing them one at a time).
find . -name "*.sh" -type f -exec sed -i 's/\r$//' {} +

echo "[remote-deploy] Fetching real secrets from Secrets Manager (never logged)..."
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --region "$REGION" --query SecretString --output text)

get_secret() { echo "$SECRET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }

echo "[remote-deploy] Rendering .env (real values, never printed to this log)..."
cat > .env <<ENVEOF
PUBLIC_APP_DOMAIN=acis.netcradus.com
ACME_EMAIL=info@netcradus.com
DB_HOST_RDS=${RDS_ADDRESS}
DB_PORT=5432
DB_NAME=acis
DB_USER=acis_app
DB_PASSWORD=$(get_secret DB_PASSWORD)
POSTGRES_ADMIN_PASSWORD=$(get_secret POSTGRES_ADMIN_PASSWORD)
KEYCLOAK_DB_PASSWORD=$(get_secret KEYCLOAK_DB_PASSWORD)
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=$(get_secret KEYCLOAK_ADMIN_PASSWORD)
KEYCLOAK_BACKEND_CLIENT_SECRET=$(get_secret KEYCLOAK_BACKEND_CLIENT_SECRET)
INTERNAL_SERVICE_KEY=$(get_secret INTERNAL_SERVICE_KEY)
CREDENTIAL_ENCRYPTION_KEY=$(get_secret CREDENTIAL_ENCRYPTION_KEY)
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=$(get_secret GRAFANA_ADMIN_PASSWORD)
SMTP_HOST=smtppro.zoho.eu
SMTP_PORT=465
SMTP_USERNAME=info@netcradus.com
SMTP_PASSWORD=$(get_secret SMTP_PASSWORD)
SMTP_SSL=true
MAIL_FROM_EMAIL=info@netcradus.com
MAIL_FROM_NAME=Acis NetCradus
ALERTMANAGER_ALERT_EMAIL=info@netcradus.com
CORS_ALLOWED_ORIGINS=https://acis.netcradus.com
BACKUP_RETENTION_DAYS=14
BACKUP_HOUR_UTC=2
ENVEOF
chmod 600 .env
echo "[remote-deploy] .env rendered ($(wc -l < .env) lines, values not shown)"

echo "[remote-deploy] Ensuring the real acis_app / keycloak roles + keycloak DB exist on RDS (same real init this project already uses locally via infra/postgres-init, RDS just cannot auto-run entrypoint scripts the way the local Postgres container image does)..."
DB_PASSWORD_VAL=$(get_secret DB_PASSWORD)
KEYCLOAK_DB_PASSWORD_VAL=$(get_secret KEYCLOAK_DB_PASSWORD)
POSTGRES_ADMIN_PASSWORD_VAL=$(get_secret POSTGRES_ADMIN_PASSWORD)

docker run --rm \
  -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD_VAL" \
  -e APP_DB_PASSWORD="$DB_PASSWORD_VAL" \
  -v /opt/acis/app/infra/postgres-init:/scripts:ro \
  postgres:16 \
  bash -c "POSTGRES_USER=acis_admin POSTGRES_DB=acis PGHOST=${RDS_ADDRESS} PGPORT=5432 bash /scripts/01-create-app-role.sh"

docker run --rm \
  -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD_VAL" \
  -e KEYCLOAK_DB_PASSWORD="$KEYCLOAK_DB_PASSWORD_VAL" \
  -v /opt/acis/app/infra/postgres-init:/scripts:ro \
  postgres:16 \
  bash -c "POSTGRES_USER=acis_admin POSTGRES_DB=acis PGHOST=${RDS_ADDRESS} PGPORT=5432 bash /scripts/02-create-keycloak-db.sh"

echo "[remote-deploy] Real Postgres RLS/role bootstrap on RDS complete."

echo "[remote-deploy] Rendering Alertmanager config..."
sh infra/scripts/render-alertmanager-config.sh

# Real, immutable, git-SHA image tags - same versioned-rollback mechanism
# already proven locally (infra/scripts/deploy.sh/rollback.sh). deploy-to-aws.sh
# computes this from the real commit being deployed and passes it through via
# SSM; falls back to :latest only for an ad hoc manual run with none set.
export IMAGE_TAG="${IMAGE_TAG:-latest}"
echo "[remote-deploy] Building and starting the stack (docker-compose.aws.yml), IMAGE_TAG=${IMAGE_TAG}..."
docker compose -f docker-compose.aws.yml build

echo "[remote-deploy] Also tagging every image as :latest for convenience (mirrors infra/scripts/deploy.sh)..."
for svc in frontend ai-service keycloak gateway alerts log-service correlation ingestion soar asset-service platform-admin threat-service; do
  docker tag "acis/${svc}:${IMAGE_TAG}" "acis/${svc}:latest" 2>/dev/null || true
done

docker compose -f docker-compose.aws.yml up -d

# deploy-history.log lives outside /opt/acis/app (which this script wipes
# with `rm -rf` on every run) so the record of what's been deployed survives
# across deploys - the thing infra/scripts/rollback-aws.sh reads to know
# what a rollback target actually was.
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) DEPLOY  ${IMAGE_TAG}" >> /opt/acis/deploy-history.log

echo "[remote-deploy] Done. Now running: ${IMAGE_TAG}"
echo "[remote-deploy] Container status:"
docker compose -f docker-compose.aws.yml ps
