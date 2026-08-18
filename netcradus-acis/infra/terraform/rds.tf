resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

# Postgres 16 - matches the already-verified local deployment (postgres:16
# image, RLS-enforced schema tested extensively there) exactly, so the
# same init scripts/migrations apply unchanged.
resource "aws_db_instance" "main" {
  identifier     = "${var.project_name}-${var.environment}"
  engine         = "postgres"
  engine_version = "16.14" # latest 16.x actually available on RDS in ap-south-1 - verified via `aws rds describe-db-engine-versions`, not guessed
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true
  max_allocated_storage = var.db_allocated_storage_gb * 4 # storage autoscaling ceiling

  db_name  = "acis"
  username = "acis_admin"
  password = random_password.db_password.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # Single-AZ, not Multi-AZ - a deliberate cost tradeoff for this
  # deployment's current scale (Multi-AZ roughly doubles RDS cost).
  # Automated backups + storage encryption cover the real durability
  # requirement; Multi-AZ (automatic failover) is a legitimate future
  # upgrade once uptime SLAs justify the cost, not something silently
  # skipped.
  multi_az = false

  backup_retention_period    = var.backup_retention_days
  backup_window              = "18:30-19:00" # 00:00-00:30 IST - lowest-traffic window
  maintenance_window         = "sun:19:00-sun:20:00"
  copy_tags_to_snapshot      = true
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${var.project_name}-${var.environment}-final-snapshot"
  auto_minor_version_upgrade = true

  performance_insights_enabled = true

  tags = {
    Name = "${var.project_name}-${var.environment}-db"
  }
}
