#!/bin/sh
# Real AWS rollback - no rebuild, just restarts the stack on the EC2 app
# host using a previously-built, still-locally-tagged image set
# (acis/<service>:<git-sha>), exactly mirroring the already-proven local
# infra/scripts/rollback.sh. Runs entirely via SSM Send-Command against
# /opt/acis/app (left in place by the last aws-remote-deploy.sh run - this
# script does NOT re-upload or re-extract the repo, so it only works if a
# real deploy-to-aws.sh run has already happened on this instance).
#
# Ships the remote logic as a real script uploaded to S3 and executed via
# SSM (same pattern as aws-remote-deploy.sh) rather than embedding a
# multi-line command inline in the SSM `commands` parameter - the latter
# was tried first and reliably breaks (AWS-RunShellScript does not
# preserve embedded newlines the way a local multi-line string implies,
# so `set -e` on its own line ends up swallowing everything after it as
# positional args until it hits a token starting with "-", which then
# fails as "invalid option").
#
# Usage: sh infra/scripts/rollback-aws.sh <git-sha>
# (the short sha deploy-to-aws.sh printed, or see the instance's
# /opt/acis/deploy-history.log)
set -eu

TARGET_TAG="${1:?Usage: rollback-aws.sh <git-sha>  (see /opt/acis/deploy-history.log on the instance for valid values)}"

cd "$(dirname "$0")/../.."
TF_DIR="infra/terraform"
REGION="ap-south-1"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

echo "[rollback-aws] Reading Terraform outputs..."
INSTANCE_ID=$(terraform -chdir="$TF_DIR" output -raw instance_id)
S3_BUCKET=$(terraform -chdir="$TF_DIR" output -raw s3_deploy_bucket)

echo "[rollback-aws] instance=$INSTANCE_ID target_tag=$TARGET_TAG"

cat > "$SCRATCH/rollback-remote.sh" <<REMOTEEOF
#!/bin/bash
set -euo pipefail
cd /opt/acis/app
missing=0
for svc in frontend ai-service keycloak gateway alerts log-service correlation ingestion soar asset-service platform-admin threat-service; do
  if ! docker image inspect "acis/\${svc}:${TARGET_TAG}" >/dev/null 2>&1; then
    echo "[rollback-aws] MISSING: acis/\${svc}:${TARGET_TAG}" >&2
    missing=1
  fi
done
if [ "\$missing" -eq 1 ]; then
  echo "[rollback-aws] FAILED: one or more images for ${TARGET_TAG} are no longer available on this instance." >&2
  echo "[rollback-aws] A rollback can only restart what is still built - it cannot resurrect a pruned image." >&2
  exit 1
fi
export IMAGE_TAG="${TARGET_TAG}"
docker compose -f docker-compose.aws.yml up -d --no-build
echo "\$(date -u +%Y-%m-%dT%H:%M:%SZ) ROLLBACK  ${TARGET_TAG}" >> /opt/acis/deploy-history.log
echo "[rollback-aws] Done. Now running: ${TARGET_TAG}"
docker compose -f docker-compose.aws.yml ps
REMOTEEOF
sed -i 's/\r$//' "$SCRATCH/rollback-remote.sh"

echo "[rollback-aws] Uploading remote rollback script..."
aws s3 cp "$SCRATCH/rollback-remote.sh" "s3://$S3_BUCKET/deploys/rollback-remote.sh" --region "$REGION"

echo "[rollback-aws] Sending SSM command to $INSTANCE_ID..."
COMMAND_ID=$(aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --comment "acis-rollback-${TARGET_TAG}" \
  --timeout-seconds 300 \
  --parameters "commands=[\"set -e\", \"aws s3 cp s3://$S3_BUCKET/deploys/rollback-remote.sh /tmp/rollback-remote.sh --region $REGION\", \"chmod +x /tmp/rollback-remote.sh\", \"/tmp/rollback-remote.sh\"]" \
  --query "Command.CommandId" --output text)

echo "[rollback-aws] SSM command id: $COMMAND_ID"
echo "[rollback-aws] Poll status with:"
echo "  aws ssm get-command-invocation --region $REGION --command-id $COMMAND_ID --instance-id $INSTANCE_ID"
