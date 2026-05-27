data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

############################
# S3 bucket (private origin)
############################

resource "aws_s3_bucket" "downloads" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_ownership_controls" "downloads" {
  bucket = aws_s3_bucket.downloads.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "downloads" {
  bucket = aws_s3_bucket.downloads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "downloads" {
  bucket = aws_s3_bucket.downloads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "downloads" {
  bucket = aws_s3_bucket.downloads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

##############################
# CloudFront + ACM (us-east-1)
##############################

resource "aws_cloudfront_origin_access_control" "downloads" {
  name                              = "${var.bucket_name}-oac"
  description                       = "OAC for ${var.bucket_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_acm_certificate" "downloads" {
  provider                  = aws.us_east_1
  domain_name               = var.domain_name
  validation_method         = "DNS"
  subject_alternative_names = []

  lifecycle {
    create_before_destroy = true
  }
}

# Route53-managed validation. Skipped when DNS is external.
resource "aws_route53_record" "cert_validation" {
  for_each = var.dns_provider == "route53" ? {
    for dvo in aws_acm_certificate.downloads.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 300
  allow_overwrite = true
}

# Validation completion. When DNS is external the operator adds the CNAMEs by
# hand, then re-runs `terraform apply` — the cert resource will already be ISSUED
# and this resource simply confirms it. The validation_record_fqdns list is empty
# in external mode (we cannot create the records); ACM still waits on issuance.
resource "aws_acm_certificate_validation" "downloads" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.downloads.arn
  validation_record_fqdns = var.dns_provider == "route53" ? [for r in aws_route53_record.cert_validation : r.fqdn] : null

  timeouts {
    create = "60m"
  }
}

resource "aws_cloudfront_distribution" "downloads" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Praxio downloads distribution (${var.domain_name})"
  default_root_object = ""
  price_class         = "PriceClass_100" # NA + EU edges; cheapest tier that still covers our POC audience.
  http_version        = "http2and3"

  aliases = [var.domain_name]

  origin {
    domain_name              = aws_s3_bucket.downloads.bucket_regional_domain_name
    origin_id                = "s3-${var.bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.downloads.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${var.bucket_name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS managed CachingOptimized policy — long TTLs, gzip/br, query strings ignored.
    # Tuned for large binary DMGs that change only on release.
    cache_policy_id          = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    # AWS managed CORS-S3Origin — passes through what S3 needs without leaking
    # arbitrary client headers into the cache key.
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.downloads.certificate_arn
    minimum_protocol_version = "TLSv1.2_2021"
    ssl_support_method       = "sni-only"
  }

  # CloudFront standard access logs need ACLs enabled on the destination bucket,
  # which conflicts with BucketOwnerEnforced. We intentionally skip logging in the
  # initial deploy; add a dedicated praxio-downloads-logs bucket + standard-logs-v2
  # (CloudWatch / Firehose) in a follow-on change when we actually need logs.
}

##################################
# Bucket policy — CloudFront only
##################################

data "aws_iam_policy_document" "bucket_policy" {
  statement {
    sid     = "AllowCloudFrontReadViaOAC"
    actions = ["s3:GetObject"]

    resources = ["${aws_s3_bucket.downloads.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.downloads.arn]
    }
  }

  # Explicit deny on any non-TLS request — belt + suspenders alongside the
  # public access block, in case someone ever attaches a second policy.
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.downloads.arn,
      "${aws_s3_bucket.downloads.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "downloads" {
  bucket = aws_s3_bucket.downloads.id
  policy = data.aws_iam_policy_document.bucket_policy.json

  depends_on = [aws_s3_bucket_public_access_block.downloads]
}

####################################
# DNS alias for downloads.praxio.app
####################################

resource "aws_route53_record" "downloads_alias_a" {
  count = var.dns_provider == "route53" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.downloads.domain_name
    zone_id                = aws_cloudfront_distribution.downloads.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "downloads_alias_aaaa" {
  count = var.dns_provider == "route53" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.downloads.domain_name
    zone_id                = aws_cloudfront_distribution.downloads.hosted_zone_id
    evaluate_target_health = false
  }
}

#######################################
# GitHub OIDC provider + role for CI
#######################################

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]

  # GitHub's OIDC fingerprints — AWS no longer enforces these for the
  # token.actions.githubusercontent.com host, but the field is still required.
  # Values from https://github.blog/changelog/2023-07-06-github-actions-update-on-oidc-integration-with-aws/
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

data "aws_iam_policy_document" "github_oidc_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Lock the trust policy to the praxio repo + praxio-release environment.
    # No other branch, tag, PR, or environment can mint a token that assumes this role.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:environment:${var.github_environment}",
      ]
    }
  }
}

resource "aws_iam_role" "github_oidc_release" {
  name               = "praxio-release-github-oidc"
  description        = "GitHub Actions role for the praxio-release environment. Uploads release artifacts to s3://${var.bucket_name}/${var.release_prefix}."
  assume_role_policy = data.aws_iam_policy_document.github_oidc_trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "release_role_policy" {
  # Write release artifacts under /stable/ only.
  statement {
    sid     = "PutReleaseArtifacts"
    actions = [
      "s3:PutObject",
      "s3:PutObjectTagging",
      "s3:AbortMultipartUpload",
    ]

    resources = [
      "${aws_s3_bucket.downloads.arn}/${var.release_prefix}*",
    ]
  }

  # Allow head/list scoped to /stable/ so the runner can verify uploads.
  statement {
    sid     = "ReadOwnReleaseArtifacts"
    actions = [
      "s3:GetObject",
      "s3:GetObjectTagging",
    ]

    resources = [
      "${aws_s3_bucket.downloads.arn}/${var.release_prefix}*",
    ]
  }

  statement {
    sid     = "ListReleasePrefix"
    actions = ["s3:ListBucket"]
    resources = [aws_s3_bucket.downloads.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values = [
        var.release_prefix,
        "${var.release_prefix}*",
      ]
    }
  }

  # Allow CloudFront cache invalidations after a release lands.
  statement {
    sid     = "InvalidateReleaseCache"
    actions = [
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
    ]
    resources = [
      "arn:${data.aws_partition.current.partition}:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${aws_cloudfront_distribution.downloads.id}",
    ]
  }
}

resource "aws_iam_role_policy" "github_oidc_release" {
  name   = "praxio-release-write-stable"
  role   = aws_iam_role.github_oidc_release.id
  policy = data.aws_iam_policy_document.release_role_policy.json
}
