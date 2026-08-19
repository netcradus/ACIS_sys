#!/bin/bash
# Runs ON the EC2 app host (via SSM Send-Command, triggered by the
# GitHub Actions deploy job - see .github/workflows/deploy-production.yml).
# Never invoked directly / never used by the manual deploy-to-aws.sh path,
# which keeps building on-host exactly as it always has - this script is
# additive, not a replacement.
#
# Difference from aws-remote-deploy.sh: images are already built, already
# Trivy-scanned, and already pushed to ECR by the CI pipeline before this
# ever runs. This script only pulls the specific immutable tag CI just
# pushed and starts the stack - it never runs `docker compose build`, so
# what's running in production is bit-for-bit the same image CI scanned,
# not a fresh rebuild that could theoretically differ.
#
# Expects S3_BUCKET, SECRET_ARN, RDS_ADDRESS, REGION, ECR_REGISTRY,
# IMAGE_TAG as env vars.
set -euo pipefail

echo "[remote-deploy-ecr] Waiting for instance bootstrap (Docker install) to finish..."
for i in $(seq 1 30); do
  [ -f /opt/acis/bootstrap.done ] && break
  sleep 10
done
[ -f /opt/acis/bootstrap.done ] || { echo "[remote-deploy-ecr] FAILED: bootstrap never completed"; exit 1; }

echo "[remote-deploy-ecr] Fetching application code (config/templates only - images come from ECR, not this tree)..."
rm -rf /opt/acis/app
mkdir -p /opt/acis/app
aws s3 cp "s3://${S3_BUCKET}/deploys/repo.tar.gz" /tmp/repo.tar.gz --region "$REGION"
tar -xzf /tmp/repo.tar.gz -C /opt/acis/app
cd /opt/acis/app

# Same defensive CRLF normalization as aws-remote-deploy.sh - see that
# script's comment for the full story.
find . -name "*.sh" -type f -exec sed -i 's/\r$//' {} +

echo "[remote-deploy-ecr] Fetching pre-generated ECR-mode compose file..."
aws s3 cp "s3://${S3_BUCKET}/deploys/docker-compose.aws.yml" /opt/acis/app/docker-compose.aws.yml --region "$REGION"

echo "[remote-deploy-ecr] Fetching real secrets from Secrets Manager (never logged)..."
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --region "$REGION" --query SecretString --output text)

get_secret() { echo "$SECRET_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }

echo "[remote-deploy-ecr] Rendering .env (real values, never printed to this log)..."
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
echo "[remote-deploy-ecr] .env rendered ($(wc -l < .env) lines, values not shown)"

echo "[remote-deploy-ecr] Rendering Alertmanager config..."
sh infra/scripts/render-alertmanager-config.sh

echo "[remote-deploy-ecr] Authenticating to ECR..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

export IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG must be set for an ECR-mode deploy}"
echo "[remote-deploy-ecr] Pulling pre-built, pre-scanned images at tag ${IMAGE_TAG}..."
docker compose -f docker-compose.aws.yml pull

echo "[remote-deploy-ecr] Also tagging every image as :latest for convenience (mirrors infra/scripts/deploy.sh)..."
for svc in frontend ai-service keycloak gateway alerts log-service correlation ingestion soar asset-service platform-admin threat-service; do
  docker tag "${ECR_REGISTRY}/acis/${svc}:${IMAGE_TAG}" "${ECR_REGISTRY}/acis/${svc}:latest" 2>/dev/null || true
done

docker compose -f docker-compose.aws.yml up -d

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) DEPLOY  ${IMAGE_TAG}  (ecr,ci)" >> /opt/acis/deploy-history.log

echo "[remote-deploy-ecr] Done. Now running: ${IMAGE_TAG}"
echo "[remote-deploy-ecr] Container status:"
docker compose -f docker-compose.aws.yml ps
