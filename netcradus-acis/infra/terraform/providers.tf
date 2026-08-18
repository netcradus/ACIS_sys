terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Local backend deliberately, not S3 - this is the first real deploy of
  # this project's infrastructure, no bucket exists yet to hold remote
  # state. terraform.tfstate is gitignored (see infra/terraform/.gitignore)
  # since it contains resource IDs and, transiently, some secret values.
  # Migrating to an S3+DynamoDB backend is a real, recommended follow-up
  # once this account has more than one operator touching this stack.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "acis"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
