terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

# Primary region for the bucket + CloudFront control plane.
# Override with -var region=... if Rosalind/CTO pick a different home region.
provider "aws" {
  region = var.region

  default_tags {
    tags = local.common_tags
  }
}

# CloudFront's ACM certs MUST live in us-east-1. Always keep this alias even when
# var.region == "us-east-1" — it makes the dependency explicit.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.common_tags
  }
}
