#!/bin/sh
# Real AWS rollback - no rebuild, just restarts the stack on the EC2 app
# host using a previously-built, still-locally-tagged image set
# (acis/<service>:<git-sha>), exactly mirroring the already-proven local
# infra/scripts/rollback.sh. Runs entirely via SSM Send-Command against
# /opt/acis/app (left in place by the last aws-remote-deploy.sh run - this
# script does NOT re-upload or re-extract the repo, so it only works if a
# real deploy-to-aws.sh run has already happened on this instance).
#
# Usage: sh infra/scripts/rollback-aws.sh <git-sha>
# (the short sha deploy-to-aws.sh printed, or see the instance's
# /opt/acis/deploy-history.log)
set -eu

TARGET_TAG="${1:?Usage: rollback-aws.sh <git-sha>  (see /opt/acis/deploy-history.log on the instance for valid values)}"

cd "$(dirname "$0")/../.."
TF_DIR="infra/terraform"
REGION="ap-south-1"

echo "[rollback-aws] Reading Terraform outputs..."
INSTANCE_ID=$(terraform -chdir="$TF_DIR" output -raw instance_id)

echo "[rollback-aws] instance=$INSTANCE_ID target_tag=$TARGET_TAG"

REMOTE_CMD="set -e
cd /opt/acis/app
missing=0
for svc in frontend ai-service keycloak gateway alerts log-service correlation ingestion soar asset-service platform-admin threat-service; do
  if ! docker image inspect \"acis/\$svc:$TARGET_TAG\" >/dev/null 2>&1; then
    echo \"[rollback-aws] MISSING: acis/\$svc:$TARGET_TAG\" >&2
    missing=1
  fi
done
if [ \"\$missing\" -eq 1 ]; then
  echo '[rollback-aws] FAILED: one or more images for $TARGET_TAG are no longer available on this instance.' >&2
  echo '[rollback-aws] A rollback can only restart what is still built - it cannot resurrect a pruned image.' >&2
  exit 1
fi
export IMAGE_TAG=$TARGET_TAG
docker compose -f docker-compose.aws.yml up -d --no-build
echo \"\$(date -u +%Y-%m-%dT%H:%M:%SZ) ROLLBACK  $TARGET_TAG\" >> /opt/acis/deploy-history.log
echo '[rollback-aws] Done. Now running: $TARGET_TAG'
docker compose -f docker-compose.aws.yml ps"

echo "[rollback-aws] Sending SSM command to $INSTANCE_ID..."
COMMAND_ID=$(aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --comment "acis-rollback-${TARGET_TAG}" \
  --timeout-seconds 300 \
  --parameters "commands=[$(printf '%s' "$REMOTE_CMD" | python -c 'import json,sys; print(json.dumps(sys.stdin.read()))')]" \
  --query "Command.CommandId" --output text)

echo "[rollback-aws] SSM command id: $COMMAND_ID"
echo "[rollback-aws] Poll status with:"
echo "  aws ssm get-command-invocation --region $REGION --command-id $COMMAND_ID --instance-id $INSTANCE_ID"
