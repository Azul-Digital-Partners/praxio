#!/usr/bin/env bash
# bootstrap.sh — provision DigitalOcean Spaces + DO CDN for downloads.praxio.app
#
# Architecture per CEO ruling on AZU-1846: DigitalOcean Spaces (S3-compatible)
# fronted by DO CDN with a Let's-Encrypt cert for downloads.praxio.app. Replaces
# the AWS S3 + CloudFront + ACM + OIDC IAM module that lived here previously
# (see git history for AZU-1835 / AZU-1850).
#
# Idempotent: every step is a "create if missing / show if present" so the
# script is safe to re-run. Outputs the values that need to land in GitHub
# Actions `praxio-release` environment + the CNAME target that needs to land
# at Porkbun.
#
# Required tooling:
#   - doctl >= 1.104.0     (CDN + Certificate API)
#   - aws CLI v2           (only for Spaces / S3 API — endpoint override)
#   - jq
#
# Required env (export before invoking):
#   AWS_ACCESS_KEY_ID       DO Spaces access key id
#   AWS_SECRET_ACCESS_KEY   DO Spaces secret key
#   (use a Spaces access key from the DO control panel — these are
#    account-scoped; DO Spaces does NOT support prefix-scoped keys at the
#    key level. Workflow + env protection on `praxio-release` is the
#    substitute. Documented in README.)
#
# Optional env (with defaults):
#   DO_REGION              default: nyc3
#   BUCKET_NAME            default: praxio-downloads
#   DOMAIN_NAME            default: downloads.praxio.app
#   CDN_TTL_SECONDS        default: 3600

set -euo pipefail

DO_REGION="${DO_REGION:-nyc3}"
BUCKET_NAME="${BUCKET_NAME:-praxio-downloads}"
DOMAIN_NAME="${DOMAIN_NAME:-downloads.praxio.app}"
CDN_TTL_SECONDS="${CDN_TTL_SECONDS:-3600}"
CERT_NAME="praxio-downloads-cert"

SPACES_ENDPOINT="https://${DO_REGION}.digitaloceanspaces.com"
SPACES_ORIGIN="${BUCKET_NAME}.${DO_REGION}.digitaloceanspaces.com"

log() { printf '[bootstrap] %s\n' "$*" >&2; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    log "missing required command: $1"
    exit 1
  }
}

require_cmd doctl
require_cmd aws
require_cmd jq

if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  log "AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY must be set (DO Spaces key)."
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Spaces bucket
# ---------------------------------------------------------------------------
log "Ensuring Spaces bucket s3://${BUCKET_NAME} in region ${DO_REGION}"

if aws s3api head-bucket \
     --bucket "${BUCKET_NAME}" \
     --endpoint-url "${SPACES_ENDPOINT}" >/dev/null 2>&1; then
  log "  bucket exists"
else
  aws s3api create-bucket \
    --bucket "${BUCKET_NAME}" \
    --endpoint-url "${SPACES_ENDPOINT}" \
    --acl private >/dev/null
  log "  bucket created"
fi

# Private ACL (defensive — should already be private).
aws s3api put-bucket-acl \
  --bucket "${BUCKET_NAME}" \
  --endpoint-url "${SPACES_ENDPOINT}" \
  --acl private >/dev/null

# Versioning on. DO Spaces supports the S3 versioning API.
log "Enabling versioning"
aws s3api put-bucket-versioning \
  --bucket "${BUCKET_NAME}" \
  --endpoint-url "${SPACES_ENDPOINT}" \
  --versioning-configuration Status=Enabled >/dev/null

# ---------------------------------------------------------------------------
# 2. Certificate (Let's Encrypt, DNS-managed by DO)
# ---------------------------------------------------------------------------
log "Ensuring Let's Encrypt certificate ${CERT_NAME} for ${DOMAIN_NAME}"

CERT_ID="$(doctl compute certificate list -o json \
  | jq -r --arg name "${CERT_NAME}" \
       '.[] | select(.name == $name) | .id' \
  | head -n1 || true)"

if [[ -z "${CERT_ID}" || "${CERT_ID}" == "null" ]]; then
  log "  creating certificate (DO will provision via Let's Encrypt — domain"
  log "  must already be reachable; expect this to succeed once the Porkbun"
  log "  CNAME for ${DOMAIN_NAME} -> <cdn endpoint> has been published. If"
  log "  this is the first bootstrap, re-run after Rosalind lands the CNAME.)"

  CERT_ID="$(doctl compute certificate create \
    --name "${CERT_NAME}" \
    --type lets_encrypt \
    --dns-names "${DOMAIN_NAME}" \
    -o json | jq -r '.[0].id')"
  log "  certificate created: ${CERT_ID}"
else
  log "  certificate exists: ${CERT_ID}"
fi

# ---------------------------------------------------------------------------
# 3. CDN distribution
# ---------------------------------------------------------------------------
log "Ensuring CDN distribution for origin ${SPACES_ORIGIN}"

CDN_ID="$(doctl compute cdn list -o json \
  | jq -r --arg origin "${SPACES_ORIGIN}" \
       '.[] | select(.origin == $origin) | .id' \
  | head -n1 || true)"

if [[ -z "${CDN_ID}" || "${CDN_ID}" == "null" ]]; then
  log "  creating CDN distribution"
  CDN_ID="$(doctl compute cdn create "${SPACES_ORIGIN}" \
    --ttl "${CDN_TTL_SECONDS}" \
    --domain "${DOMAIN_NAME}" \
    --certificate-id "${CERT_ID}" \
    -o json | jq -r '.[0].id')"
  log "  CDN created: ${CDN_ID}"
else
  log "  CDN exists: ${CDN_ID}"
  log "  updating TTL / custom domain / cert binding"
  doctl compute cdn update "${CDN_ID}" \
    --ttl "${CDN_TTL_SECONDS}" \
    --domain "${DOMAIN_NAME}" \
    --certificate-id "${CERT_ID}" >/dev/null
fi

CDN_ENDPOINT="$(doctl compute cdn get "${CDN_ID}" -o json \
  | jq -r '.[0].endpoint')"

# ---------------------------------------------------------------------------
# 4. Outputs
# ---------------------------------------------------------------------------
cat <<EOF

================================================================
DigitalOcean Spaces + CDN for ${DOMAIN_NAME} ready.

Outputs (copy into the GitHub Actions \`praxio-release\` environment
and post to AZU-1850 so Rosalind can publish the Porkbun CNAME):

  do_spaces_region    = ${DO_REGION}
  do_spaces_bucket    = ${BUCKET_NAME}
  do_spaces_endpoint  = ${SPACES_ENDPOINT}
  do_cdn_id           = ${CDN_ID}
  do_cdn_endpoint     = ${CDN_ENDPOINT}
  do_certificate_id   = ${CERT_ID}

GitHub Actions environment variables to set (on the \`praxio-release\`
environment in Azul-Digital-Partners/praxio):

  DO_SPACES_REGION         = ${DO_REGION}
  DO_SPACES_BUCKET         = ${BUCKET_NAME}
  DO_SPACES_ENDPOINT       = ${SPACES_ENDPOINT}
  DO_CDN_ID                = ${CDN_ID}
  DO_CDN_ENDPOINT          = ${CDN_ENDPOINT}

GitHub Actions environment secrets to set:

  DO_SPACES_ACCESS_KEY_ID
  DO_SPACES_SECRET_ACCESS_KEY

Porkbun CNAME to publish (Rosalind owns this on AZU-1842):

  ${DOMAIN_NAME}  CNAME  ${CDN_ENDPOINT}

================================================================
EOF
