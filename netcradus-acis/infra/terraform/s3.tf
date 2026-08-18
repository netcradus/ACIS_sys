# Holds a tarball of the exact, already-tested repo state to deploy - the
# EC2 app host pulls from here via its IAM role (s3.tf's bucket policy),
# not from GitHub directly, so no git credentials/deploy key ever need to
# exist on the instance at all.

resource "aws_s3_bucket" "deploy_artifacts" {
  bucket = "${var.project_name}-deploy-artifacts-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "deploy_artifacts" {
  bucket                  = aws_s3_bucket.deploy_artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "deploy_artifacts" {
  bucket = aws_s3_bucket.deploy_artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "deploy_artifacts" {
  bucket = aws_s3_bucket.deploy_artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_caller_identity" "current" {}

resource "aws_iam_role_policy" "s3_deploy_read" {
  name = "${var.project_name}-s3-deploy-read"
  role = aws_iam_role.app_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:ListBucket"]
      Resource = [aws_s3_bucket.deploy_artifacts.arn, "${aws_s3_bucket.deploy_artifacts.arn}/*"]
    }]
  })
}
