#!/usr/bin/env bash
# bootstrap.sh — provision the Praxio downloads distribution on DigitalOcean.
#
# Replaces the previous Terraform module (AWS S3 + CloudFront + ACM + OIDC IAM).
# Per CEO ruling on AZU-1846, the downloads CDN runs on DigitalOcean Spaces +
# DO CDN instead of AWS. Background: /AZU/issues/AZU-1846#document-plan.
#
# This script is intentionally a single shell file rather than a Terraform
# module. We provision exactly one environment (downloads.praxio.app); the value
# Terraform adds (drift detection, multi-env, plan/apply) does not pay for the
# maintenance cost here. CTO decision in AZU-1850.
#
# Idempotent. Re-running any subcommand is safe — each step checks for the
# target resource first and reuses what exists.
#
# Usage:
#   ./bootstrap.sh up              # phase 1: bucket + CDN (no custom domain yet)
#   ./bootstrap.sh attach-domain   # phase 2: LE cert + custom domain
#                                  # pre-req: downloads.praxio.app CNAME → CDN
#   ./bootstrap.sh create-key      # mint a Spaces access key for praxio-release
#   ./bootstrap.sh outputs         # print resource ids/endpoints for the issue
#   ./bootstrap.sh status          # show what's provisioned, what's missing
#
# Requirements on the runner:
#   - doctl ≥ 1.119 (Spaces keys subcommand), authenticated (`doctl auth init`)
#   - aws CLI (used as an S3-compatible client against Spaces; no AWS account
#     required, only Spaces credentials)
#   - jq, curl
#
# Required environment variables:
#   DO_SPACES_REGION         e.g. nyc3
#   DO_SPACES_BUCKET         e.g. praxio-downloads
#   DOWNLOADS_DOMAIN         e.g. downloads.praxio.app
#   DO_SPACES_ACCESS_KEY_ID  admin Spaces key (any DO Spaces key with bucket-create perms)
#   DO_SPACES_SECRET_ACCESS_KEY
#
# These two are only used by `up` / `attach-domain` for the bootstrap apply.
# The release-time key minted via `create-key` is a DIFFERENT, narrower key
# stored in the praxio-release GitHub environment.

set -euo pipefail

#───────────────────────────────────────────────────────────────────────────────
# Config + helpers
#───────────────────────────────────────────────────────────────────────────────

: "${DO_SPACES_REGION:?DO_SPACES_REGION is required (e.g. nyc3)}"
: "${DO_SPACES_BUCKET:?DO_SPACES_BUCKET is required (e.g. praxio-downloads)}"
: "${DOWNLOADS_DOMAIN:?DOWNLOADS_DOMAIN is required (e.g. downloads.praxio.app)}"

SPACES_ENDPOINT="https://${DO_SPACES_REGION}.digitaloceanspaces.com"
BUCKET_ORIGIN="${DO_SPACES_BUCKET}.${DO_SPACES_REGION}.digitaloceanspaces.com"
RELEASE_PREFIX="${RELEASE_PREFIX:-stable/}"
CDN_TTL_SECONDS="${CDN_TTL_SECONDS:-3600}"
CERT_NAME="${CERT_NAME:-praxio-downloads-le}"

log() { printf '[bootstrap] %s\n' "$*" >&2; }
die() { printf '[bootstrap] ERROR: %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

require_cmd doctl
require_cmd aws
require_cmd jq
require_cmd curl

# AWS CLI talks to Spaces when given DO Spaces credentials and --endpoint-url.
# The release-time key is a different, narrower pair stored in GH env secrets.
need_admin_spaces_creds() {
  : "${DO_SPACES_ACCESS_KEY_ID:?DO_SPACES_ACCESS_KEY_ID required for $1}"
  : "${DO_SPACES_SECRET_ACCESS_KEY:?DO_SPACES_SECRET_ACCESS_KEY required for $1}"
  export AWS_ACCESS_KEY_ID="$DO_SPACES_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$DO_SPACES_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION="$DO_SPACES_REGION"
}

s3() { aws --endpoint-url="$SPACES_ENDPOINT" "$@"; }

#───────────────────────────────────────────────────────────────────────────────
# Bucket
#───────────────────────────────────────────────────────────────────────────────

bucket_exists() {
  s3 s3api head-bucket --bucket "$DO_SPACES_BUCKET" >/dev/null 2>&1
}

create_bucket() {
  if bucket_exists; then
    log "bucket s3://${DO_SPACES_BUCKET} already exists — skipping create"
  else
    log "creating bucket s3://${DO_SPACES_BUCKET} in ${DO_SPACES_REGION}"
    s3 s3api create-bucket --bucket "$DO_SPACES_BUCKET" --acl private
  fi

  log "ensuring bucket ACL is private (CDN is the public surface)"
  s3 s3api put-bucket-acl --bucket "$DO_SPACES_BUCKET" --acl private

  log "enabling versioning on s3://${DO_SPACES_BUCKET}"
  s3 s3api put-bucket-versioning \
    --bucket "$DO_SPACES_BUCKET" \
    --versioning-configuration Status=Enabled
}

#───────────────────────────────────────────────────────────────────────────────
# CDN
#───────────────────────────────────────────────────────────────────────────────

cdn_id_for_origin() {
  doctl compute cdn list --output json 2>/dev/null \
    | jq -r --arg origin "$BUCKET_ORIGIN" '.[] | select(.origin == $origin) | .id' \
    | head -n1
}

cdn_get() {
  local id="$1"
  doctl compute cdn get "$id" --output json
}

create_cdn_no_custom_domain() {
  local existing
  existing="$(cdn_id_for_origin || true)"
  if [[ -n "$existing" ]]; then
    log "CDN already exists for origin ${BUCKET_ORIGIN}: ${existing}"
    echo "$existing"
    return 0
  fi

  log "creating CDN distribution for ${BUCKET_ORIGIN} (TTL=${CDN_TTL_SECONDS}s)"
  local id
  id="$(doctl compute cdn create \
    --origin "$BUCKET_ORIGIN" \
    --ttl "$CDN_TTL_SECONDS" \
    --output json \
    | jq -r '.[0].id // .id')"
  if [[ -z "$id" || "$id" == "null" ]]; then
    die "failed to create CDN — empty id"
  fi
  log "created CDN ${id}"
  echo "$id"
}

#───────────────────────────────────────────────────────────────────────────────
# Certificate (Let's Encrypt managed by DO)
#───────────────────────────────────────────────────────────────────────────────

cert_id_by_name() {
  doctl compute certificate list --output json 2>/dev/null \
    | jq -r --arg name "$CERT_NAME" '.[] | select(.name == $name) | .id' \
    | head -n1
}

create_le_cert() {
  local existing
  existing="$(cert_id_by_name || true)"
  if [[ -n "$existing" ]]; then
    log "certificate ${CERT_NAME} already exists: ${existing}"
    echo "$existing"
    return 0
  fi

  log "creating Let's Encrypt certificate ${CERT_NAME} for ${DOWNLOADS_DOMAIN}"
  log "pre-condition: ${DOWNLOADS_DOMAIN} CNAME must already resolve to the CDN endpoint"
  log "  (DO validates LE via HTTP-01 against the CDN edge — without DNS, this will fail)"

  # `doctl compute certificate create` blocks until the cert is ISSUED or fails.
  local id
  id="$(doctl compute certificate create \
    --name "$CERT_NAME" \
    --type lets_encrypt \
    --dns-names "$DOWNLOADS_DOMAIN" \
    --output json \
    | jq -r '.[0].id // .id')"
  if [[ -z "$id" || "$id" == "null" ]]; then
    die "failed to create LE certificate"
  fi
  log "created certificate ${id}"
  echo "$id"
}

attach_custom_domain() {
  local cdn_id="$1"
  local cert_id="$2"

  local current_domain
  current_domain="$(cdn_get "$cdn_id" | jq -r '.[0].custom_domain // .custom_domain // empty')"

  if [[ "$current_domain" == "$DOWNLOADS_DOMAIN" ]]; then
    log "CDN ${cdn_id} already has custom_domain=${DOWNLOADS_DOMAIN} — skipping"
    return 0
  fi

  log "attaching custom_domain=${DOWNLOADS_DOMAIN} + certificate=${cert_id} to CDN ${cdn_id}"
  doctl compute cdn update "$cdn_id" \
    --domain "$DOWNLOADS_DOMAIN" \
    --certificate-id "$cert_id" \
    --output json >/dev/null
  log "custom domain attached"
}

#───────────────────────────────────────────────────────────────────────────────
# Access key for praxio-release environment
#───────────────────────────────────────────────────────────────────────────────
#
# IMPORTANT: DO Spaces access keys cannot be scoped by object prefix the way
# the AWS OIDC IAM role was. There is no per-key prefix ACL. The substitute is:
#
#   - The key created here is stored in the praxio-release GitHub environment
#     as a secret.
#   - That environment has required-reviewer protection: a human must approve
#     each release run before the secret is exposed to the workflow.
#   - The workflow asserts the negative test (PutObject under non-stable/
#     prefixes must fail). DO can't enforce that at the key level, so the
#     negative test is purely workflow-level — it will pass any time DO
#     accepts the write. Treat it as a guard-rail against accidental code
#     paths writing to /beta/, not as a security boundary.
#
# Trade-off documented in README.md.

create_release_key() {
  local key_name="${1:-praxio-release}"
  log "creating Spaces access key '${key_name}'"
  log "the secret is shown ONCE — store it in the praxio-release GH env immediately"
  doctl spaces keys create "$key_name" --output json
}

#───────────────────────────────────────────────────────────────────────────────
# Subcommands
#───────────────────────────────────────────────────────────────────────────────

cmd_up() {
  need_admin_spaces_creds "up"
  create_bucket

  local cdn_id
  cdn_id="$(create_cdn_no_custom_domain)"
  local cdn_endpoint
  cdn_endpoint="$(cdn_get "$cdn_id" | jq -r '.[0].endpoint // .endpoint')"

  cat <<EOF

──────────────────────────────────────────────────────────────────────────────
Phase 1 complete.

  do_spaces_bucket   ${DO_SPACES_BUCKET}
  do_spaces_region   ${DO_SPACES_REGION}
  do_cdn_id          ${cdn_id}
  do_cdn_endpoint    ${cdn_endpoint}

Next steps:
  1. Hand the CDN endpoint to Rosalind for the Porkbun CNAME (AZU-1842):
       ${DOWNLOADS_DOMAIN}  CNAME  ${cdn_endpoint}
  2. Wait for the CNAME to resolve (dig ${DOWNLOADS_DOMAIN}).
  3. Run: ./bootstrap.sh attach-domain
──────────────────────────────────────────────────────────────────────────────
EOF
}

cmd_attach_domain() {
  need_admin_spaces_creds "attach-domain"

  # Verify DNS resolves before invoking LE — otherwise the issuance will fail
  # mid-flight and we'll burn an LE attempt against the rate limit.
  log "checking DNS for ${DOWNLOADS_DOMAIN}"
  if ! host "$DOWNLOADS_DOMAIN" >/dev/null 2>&1; then
    die "DOWNLOADS_DOMAIN does not resolve. Publish the CNAME first (Rosalind / AZU-1842)."
  fi

  local cdn_id cert_id cdn_endpoint
  cdn_id="$(cdn_id_for_origin)"
  [[ -z "$cdn_id" ]] && die "CDN does not exist yet — run './bootstrap.sh up' first"
  cdn_endpoint="$(cdn_get "$cdn_id" | jq -r '.[0].endpoint // .endpoint')"

  # Belt and suspenders: confirm the CNAME points to *our* CDN endpoint,
  # not just *any* host. Otherwise LE may still issue but the CDN won't serve.
  if ! host "$DOWNLOADS_DOMAIN" 2>/dev/null | grep -qF "$cdn_endpoint"; then
    log "WARNING: ${DOWNLOADS_DOMAIN} does not appear to point to ${cdn_endpoint}"
    log "         LE validation will likely fail. Continuing anyway — DO will tell us."
  fi

  cert_id="$(create_le_cert)"
  attach_custom_domain "$cdn_id" "$cert_id"

  cat <<EOF

──────────────────────────────────────────────────────────────────────────────
Phase 2 complete.

  do_certificate_id  ${cert_id}
  custom_domain      ${DOWNLOADS_DOMAIN}

Verify:
  curl -fsSI https://${DOWNLOADS_DOMAIN}/stable/probe.txt
  (404 until a probe is uploaded by the capability-check workflow)
──────────────────────────────────────────────────────────────────────────────
EOF
}

cmd_create_key() {
  need_admin_spaces_creds "create-key"
  create_release_key "${1:-praxio-release}"
  cat <<EOF

Store the access_key / secret_key above as praxio-release env secrets:
  DO_SPACES_ACCESS_KEY_ID
  DO_SPACES_SECRET_ACCESS_KEY

Then run the capability-check workflow:
  .github/workflows/praxio-downloads-spaces-check.yml
EOF
}

cmd_outputs() {
  local cdn_id
  cdn_id="$(cdn_id_for_origin || true)"
  if [[ -z "$cdn_id" ]]; then
    die "no CDN provisioned yet for origin ${BUCKET_ORIGIN}"
  fi
  local cdn_endpoint cert_id
  cdn_endpoint="$(cdn_get "$cdn_id" | jq -r '.[0].endpoint // .endpoint')"
  cert_id="$(cert_id_by_name || true)"

  jq -n \
    --arg bucket "$DO_SPACES_BUCKET" \
    --arg region "$DO_SPACES_REGION" \
    --arg cdn_id "$cdn_id" \
    --arg cdn_endpoint "$cdn_endpoint" \
    --arg cert_id "${cert_id:-}" \
    --arg domain "$DOWNLOADS_DOMAIN" \
    '{
       do_spaces_bucket: $bucket,
       do_spaces_region: $region,
       do_cdn_id: $cdn_id,
       do_cdn_endpoint: $cdn_endpoint,
       do_certificate_id: ($cert_id | select(. != "")),
       custom_domain: $domain
     }'
}

cmd_status() {
  local exists="no" cdn_id="(none)" cert_id="(none)" cdn_endpoint="(none)" custom_domain="(none)"
  need_admin_spaces_creds "status"

  if bucket_exists; then exists="yes"; fi

  local _cdn
  _cdn="$(cdn_id_for_origin || true)"
  if [[ -n "$_cdn" ]]; then
    cdn_id="$_cdn"
    cdn_endpoint="$(cdn_get "$cdn_id" | jq -r '.[0].endpoint // .endpoint')"
    custom_domain="$(cdn_get "$cdn_id" | jq -r '.[0].custom_domain // .custom_domain // "(none)"')"
  fi

  local _cert
  _cert="$(cert_id_by_name || true)"
  [[ -n "$_cert" ]] && cert_id="$_cert"

  cat <<EOF
bucket s3://${DO_SPACES_BUCKET} (${DO_SPACES_REGION}): ${exists}
cdn id:           ${cdn_id}
cdn endpoint:     ${cdn_endpoint}
cdn custom_domain:${custom_domain}
le certificate:   ${cert_id} (name: ${CERT_NAME})
target domain:    ${DOWNLOADS_DOMAIN}
EOF
}

#───────────────────────────────────────────────────────────────────────────────
# Dispatch
#───────────────────────────────────────────────────────────────────────────────

usage() {
  sed -n '2,30p' "$0"
  exit 2
}

cmd="${1:-}"
case "$cmd" in
  up)             shift; cmd_up "$@" ;;
  attach-domain)  shift; cmd_attach_domain "$@" ;;
  create-key)     shift; cmd_create_key "$@" ;;
  outputs)        shift; cmd_outputs "$@" ;;
  status)         shift; cmd_status "$@" ;;
  ""|-h|--help)   usage ;;
  *)              die "unknown subcommand: $cmd (try --help)" ;;
esac
