variable "aws_region" {
  description = "AWS region for this deployment"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Short project name, used as a resource-name prefix"
  type        = string
  default     = "acis"
}

variable "domain_name" {
  description = "Public domain this deployment is served on (DNS managed externally in Cloudflare, not Route 53 - ACM validation records and the final ALB CNAME are Terraform outputs the operator adds manually)"
  type        = string
  default     = "acis.netcradus.com"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "Availability zones to spread subnets across"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}

variable "app_instance_type" {
  description = "EC2 instance type for the application host. Sized to match the already-verified local deployment's real resource need (WSL2 needed ~12GB to run all 24 containers including Elasticsearch/Kafka/the PyTorch-based ai-service) with headroom."
  type        = string
  default     = "t3.xlarge" # 4 vCPU / 16 GiB
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage_gb" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 50
}

variable "backup_retention_days" {
  description = "RDS automated backup retention period"
  type        = number
  default     = 7
}

variable "ssh_key_name" {
  description = "Optional EC2 key pair name for emergency SSH access (SSM Session Manager is the primary/preferred access path - see iam.tf - so this can be left null and no SSH port is opened either way)"
  type        = string
  default     = null
}

# ---- Real secrets, never given a default - must be supplied via
# terraform.tfvars (gitignored) or -var on the command line, never
# committed. ----

variable "smtp_password" {
  description = "Real Zoho SMTP password (info@netcradus.com) - operator-supplied"
  type        = string
  sensitive   = true
}

variable "enable_https_listeners" {
  description = "ALB HTTPS listeners require an ISSUED ACM certificate, which requires the DNS validation CNAME to actually be added in Cloudflare first (a real, external, manual step - see the acm_validation_records output). Defaults to false so the rest of the infrastructure can be provisioned first; flip to true and re-apply once the certificate shows ISSUED (`aws acm describe-certificate`)."
  type        = bool
  default     = false
}

variable "acme_email" {
  description = "Contact email for TLS/ACM-related notices"
  type        = string
  default     = "info@netcradus.com"
}
