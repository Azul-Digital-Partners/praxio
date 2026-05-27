variable "region" {
  description = "Primary AWS region for the S3 bucket. CloudFront + ACM cert always live in us-east-1 regardless."
  type        = string
  default     = "us-east-1"
}

variable "bucket_name" {
  description = "Name of the private S3 bucket that backs CloudFront."
  type        = string
  default     = "praxio-downloads"
}

variable "domain_name" {
  description = "Public hostname served by CloudFront."
  type        = string
  default     = "downloads.praxio.app"
}

variable "dns_provider" {
  description = <<EOT
Where the praxio.app zone is hosted. Set to "route53" to manage cert validation
and the alias record inside this module. Set to "external" if praxio.app DNS
lives at Cloudflare/Namecheap/etc — the module then emits the CNAMEs you need
to add manually and skips Route53 entirely.
EOT
  type        = string
  default     = "external"

  validation {
    condition     = contains(["route53", "external"], var.dns_provider)
    error_message = "dns_provider must be \"route53\" or \"external\"."
  }
}

variable "route53_zone_id" {
  description = "Route53 hosted-zone ID for praxio.app. Required when dns_provider == \"route53\"."
  type        = string
  default     = ""
}

variable "github_repository" {
  description = "GitHub owner/repo permitted to assume the OIDC role."
  type        = string
  default     = "Azul-Digital-Partners/praxio"
}

variable "github_environment" {
  description = "GitHub Actions environment name scoped to the OIDC role's trust policy."
  type        = string
  default     = "praxio-release"
}

variable "release_prefix" {
  description = "S3 key prefix that the OIDC role is allowed to write to. Plan §3.1 nails this to /stable/."
  type        = string
  default     = "stable/"
}

variable "tags" {
  description = "Additional tags merged into every resource."
  type        = map(string)
  default     = {}
}

locals {
  common_tags = merge(
    {
      Project   = "praxio"
      Component = "downloads-distribution"
      ManagedBy = "terraform"
      Module    = "infra/praxio-downloads"
    },
    var.tags,
  )
}
