output "bucket_name" {
  value       = aws_s3_bucket.downloads.bucket
  description = "Name of the private origin bucket."
}

output "bucket_arn" {
  value       = aws_s3_bucket.downloads.arn
  description = "ARN of the private origin bucket."
}

output "cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.downloads.id
  description = "CloudFront distribution ID — used by release jobs to issue cache invalidations."
}

output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.downloads.domain_name
  description = "CloudFront-assigned domain (e.g. d111111abcdef8.cloudfront.net). Point downloads.praxio.app at this if DNS is external."
}

output "cloudfront_hosted_zone_id" {
  value       = aws_cloudfront_distribution.downloads.hosted_zone_id
  description = "CloudFront hosted zone ID — needed when creating ALIAS / ANAME records in DNS providers that support them."
}

output "acm_certificate_arn" {
  value       = aws_acm_certificate.downloads.arn
  description = "ACM certificate ARN (us-east-1)."
}

output "acm_validation_records" {
  description = <<EOT
DNS records you must publish to validate the ACM certificate when dns_provider == \"external\".
Each entry is { name, type, value } — create them as CNAMEs in the praxio.app zone.
Empty when dns_provider == \"route53\" (the module creates them for you).
EOT

  value = var.dns_provider == "route53" ? [] : [
    for dvo in aws_acm_certificate.downloads.domain_validation_options : {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  ]
}

output "github_oidc_role_arn" {
  value       = aws_iam_role.github_oidc_release.arn
  description = "ARN that GitHub Actions assumes via OIDC. Add to the praxio-release environment as AWS_OIDC_ROLE_ARN."
}

output "github_oidc_provider_arn" {
  value       = aws_iam_openid_connect_provider.github.arn
  description = "ARN of the AWS-side GitHub OIDC provider."
}
