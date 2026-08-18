#!/bin/sh
# Deploys the current git-committed repo state to the real AWS EC2 app
# host provisioned by infra/terraform/. No SSH involved anywhere - the
# repo is shipped via S3 (the instance's IAM role has read-only access to
# exactly this bucket, see infra/terraform/s3.tf) and executed remotely
# via SSM Send-Command (the instance's IAM role also has
# AmazonSSMManagedInstanceCore, see infra/terraform/iam.tf) - no GitHub
# credentials or SSH keys ever need to exist on the instance at all.
#
# Usage: sh infra/scripts/deploy-to-aws.sh
# Requires: aws CLI configured with real credentials, run from repo root,
# terraform already applied (reads its outputs).
set -eu

cd "$(dirname "$0")/../.."
TF_DIR="infra/terraform"
REGION="ap-south-1"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

echo "[deploy-aws] Reading Terraform outputs..."
INSTANCE_ID=$(terraform -chdir="$TF_DIR" output -raw instance_id)
S3_BUCKET=$(terraform -chdir="$TF_DIR" output -raw s3_deploy_bucket)
SECRET_ARN=$(terraform -chdir="$TF_DIR" output -raw secrets_manager_secret_arn)
RDS_ADDRESS=$(terraform -chdir="$TF_DIR" output -raw rds_address)
# Real, immutable, git-SHA image tags - same versioned-rollback mechanism
# already proven locally (infra/scripts/deploy.sh/rollback.sh). git
# archive strips .git, so the SHA has to be computed here and handed to
# the remote script explicitly.
IMAGE_TAG=$(git rev-parse --short=12 HEAD)
if ! git diff --quiet HEAD 2>/dev/null || ! git diff --cached --quiet HEAD 2>/dev/null; then
  echo "[deploy-aws] REFUSING: working tree has uncommitted changes - a deploy must correspond to a real commit for rollback to mean anything (same rule as infra/scripts/deploy.sh)." >&2
  exit 1
fi
echo "[deploy-aws] instance=$INSTANCE_ID bucket=$S3_BUCKET rds=$RDS_ADDRESS image_tag=$IMAGE_TAG"

echo "[deploy-aws] Regenerating docker-compose.aws.yml from docker-compose.prod.yml..."
python infra/scripts/generate-aws-compose.py

echo "[deploy-aws] Packaging the current git-committed tree (git archive HEAD) plus the generated compose override..."
mkdir -p "$SCRATCH/tree"
git archive HEAD | tar -x -C "$SCRATCH/tree"
cp docker-compose.aws.yml "$SCRATCH/tree/docker-compose.aws.yml"
tar -czf "$SCRATCH/repo.tar.gz" -C "$SCRATCH/tree" .

echo "[deploy-aws] Uploading to s3://$S3_BUCKET/deploys/repo.tar.gz ..."
aws s3 cp "$SCRATCH/repo.tar.gz" "s3://$S3_BUCKET/deploys/repo.tar.gz" --region "$REGION"

echo "[deploy-aws] Uploading remote deploy script..."
aws s3 cp infra/scripts/aws-remote-deploy.sh "s3://$S3_BUCKET/deploys/aws-remote-deploy.sh" --region "$REGION"

echo "[deploy-aws] Sending SSM command to $INSTANCE_ID (this runs the real build+deploy on the instance - build alone can take 15-20 min)..."
COMMAND_ID=$(aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --comment "acis-deploy" \
  --timeout-seconds 3600 \
  --parameters "commands=[\"set -e\", \"aws s3 cp s3://$S3_BUCKET/deploys/aws-remote-deploy.sh /tmp/aws-remote-deploy.sh --region $REGION\", \"chmod +x /tmp/aws-remote-deploy.sh\", \"S3_BUCKET=$S3_BUCKET SECRET_ARN='$SECRET_ARN' RDS_ADDRESS=$RDS_ADDRESS REGION=$REGION IMAGE_TAG=$IMAGE_TAG /tmp/aws-remote-deploy.sh\"]" \
  --query "Command.CommandId" --output text)

echo "[deploy-aws] SSM command id: $COMMAND_ID"
echo "[deploy-aws] Poll status with:"
echo "  aws ssm get-command-invocation --region $REGION --command-id $COMMAND_ID --instance-id $INSTANCE_ID"
