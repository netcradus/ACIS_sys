# GitHub Actions -> AWS authentication via OIDC (no long-lived AWS access
# keys stored in GitHub, no root/admin credentials for CI/CD). Every
# CI/CD run exchanges a short-lived GitHub-issued JWT for temporary AWS
# credentials scoped to exactly this role - nothing persists between runs.

# GitHub's own OIDC thumbprint is well-known and stable (GitHub publishes
# it; AWS also now verifies the certificate chain directly rather than
# relying solely on the thumbprint, but the field is still required).
data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]
}

# Scoped to this exact repo, and only to workflow runs triggered from the
# main branch - a PR from a fork (or any branch other than main) cannot
# assume this role, so CI can still build/test/scan on every push/PR
# without ever holding AWS credentials; only a real merge to main can
# reach the deploy stage.
resource "aws_iam_role" "github_actions_deploy" {
  name = "${var.project_name}-github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github_actions.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        # Real failure found running this for the first time: the deploy
        # job's `sub` claim is NOT the ref-based form below - a job that
        # references a GitHub Environment (deploy uses `environment:
        # production`) gets an environment-scoped sub claim instead
        # (repo:OWNER/REPO:environment:NAME), a real, documented GitHub
        # OIDC behavior. container-build-scan-push/verify/rollback-on-
        # failure (no `environment:`) still get the ref-based form, so
        # both are needed - StringLike accepts a list, matching if any
        # entry matches.
        StringLike = {
          "token.actions.githubusercontent.com:sub" = [
            "repo:netcradus/ACIS_sys:ref:refs/heads/main",
            "repo:netcradus/ACIS_sys:environment:production",
          ]
        }
      }
    }]
  })
}

# ECR: push the images this CI pipeline builds, scoped to exactly the 12
# acis/* repositories (GetAuthorizationToken is the one ECR action AWS
# does not support resource-level scoping for at all - it must be "*").
resource "aws_iam_role_policy" "github_actions_ecr" {
  name = "ecr-push"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrAuth"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "EcrPushPull"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
        ]
        Resource = [for r in aws_ecr_repository.services : r.arn]
      },
    ]
  })
}

# SSM: trigger the deploy on exactly this instance, using exactly the
# AWS-managed AWS-RunShellScript document - no other instance, no other
# document. GetCommandInvocation needs a broad resource because the
# command ID is only known after SendCommand returns (AWS does not
# support scoping this action by instance ARN).
resource "aws_iam_role_policy" "github_actions_ssm" {
  name = "ssm-deploy"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SendCommand"
        Effect = "Allow"
        Action = "ssm:SendCommand"
        Resource = [
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.app.id}",
          "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
        ]
      },
      {
        Sid      = "ReadCommandResult"
        Effect   = "Allow"
        Action   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
        Resource = "*"
      },
    ]
  })
}

# S3: upload the generated compose file / remote deploy scripts to the
# same deploy bucket the manual deploy-to-aws.sh path already uses -
# scoped to exactly this bucket, nothing else.
resource "aws_iam_role_policy" "github_actions_s3" {
  name = "s3-deploy-artifacts"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "DeployBucketReadWrite"
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject"]
      Resource = "${aws_s3_bucket.deploy_artifacts.arn}/deploys/*"
    }]
  })
}

# ELB: read-only, to verify target group health after a deploy - the
# pipeline's own health-gate before declaring success.
resource "aws_iam_role_policy" "github_actions_elb_read" {
  name = "elb-health-read"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "DescribeTargetHealth"
      Effect = "Allow"
      Action = ["elasticloadbalancing:DescribeTargetHealth", "elasticloadbalancing:DescribeTargetGroups"]
      Resource = [
        aws_lb_target_group.frontend.arn,
        aws_lb_target_group.keycloak.arn,
        aws_lb_target_group.grafana.arn,
      ]
    }]
  })
}

output "github_actions_deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN GitHub Actions repository variable"
  value       = aws_iam_role.github_actions_deploy.arn
}
