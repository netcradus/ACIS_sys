# Real, freshly-generated secrets for this deployment - never hardcoded,
# never committed. Terraform's own state file contains these in plaintext
# (a well-known Terraform limitation), which is exactly why
# infra/terraform/.gitignore excludes *.tfstate* - state must be treated
# with the same care as a secrets file, not committed.

resource "random_password" "db_password" {
  length  = 32
  special = false # RDS master password disallows some special chars; keeping this simple avoids fighting that allowlist
}

resource "random_password" "keycloak_admin_password" {
  length  = 24
  special = true
}

resource "random_password" "keycloak_backend_client_secret" {
  length  = 32
  special = false
}

resource "random_password" "internal_service_key" {
  length  = 48
  special = false
}

resource "random_password" "credential_encryption_key" {
  length  = 32
  special = false
}

resource "random_password" "grafana_admin_password" {
  length  = 24
  special = true
}

# One consolidated secret (JSON) rather than one Secrets Manager secret
# per value - simpler for the EC2 bootstrap script to fetch once and
# render into .env, and this project's own IAM policy (iam.tf) already
# scopes access to exactly this one secret ARN, so consolidating doesn't
# widen any real exposure.
resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "${var.project_name}/${var.environment}/app-secrets"
  description             = "Real production secrets for the ACIS deployment - DB, Keycloak, internal service auth, SMTP. Fetched once by the EC2 app host's bootstrap script (see ec2.tf user_data)."
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    DB_PASSWORD                    = random_password.db_password.result
    KEYCLOAK_DB_PASSWORD           = random_password.db_password.result # same RDS instance, same master credential - Keycloak and the app connect to two different databases on it, not two different servers
    POSTGRES_ADMIN_PASSWORD        = random_password.db_password.result
    KEYCLOAK_ADMIN_PASSWORD        = random_password.keycloak_admin_password.result
    KEYCLOAK_BACKEND_CLIENT_SECRET = random_password.keycloak_backend_client_secret.result
    INTERNAL_SERVICE_KEY           = random_password.internal_service_key.result
    CREDENTIAL_ENCRYPTION_KEY      = random_password.credential_encryption_key.result
    GRAFANA_ADMIN_PASSWORD         = random_password.grafana_admin_password.result
    SMTP_PASSWORD                  = var.smtp_password
  })
}
