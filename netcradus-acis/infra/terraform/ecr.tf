# ECR repos for every service - provisioned and ready for a future
# CI/CD push-based pipeline (Section 13 of the readiness checklist).
# NOT the primary build path for this deployment, which builds on-host
# via the already-proven infra/scripts/deploy.sh (same mechanism already
# verified extensively in the local deployment) - a fresh, untested
# ECR-push-then-pull pipeline would add real risk for no benefit in this
# pass. Real follow-up: wire CI to build+push here, then have deploy.sh
# (or its EC2 equivalent) pull from ECR instead of building on-host.

locals {
  services = [
    "frontend", "gateway", "alerts", "log-service", "correlation",
    "ingestion", "soar", "asset-service", "threat-service",
    "platform-admin", "ai-service", "keycloak",
  ]
}

resource "aws_ecr_repository" "services" {
  for_each             = toset(local.services)
  name                 = "${var.project_name}/${each.value}"
  image_tag_mutability = "IMMUTABLE" # matches this project's own established convention: never overwrite a git-SHA tag (see infra/scripts/deploy.sh)

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "services" {
  for_each   = aws_ecr_repository.services
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 20 images, expire the rest"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 20
      }
      action = { type = "expire" }
    }]
  })
}
