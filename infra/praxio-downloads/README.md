# `infra/praxio-downloads` — Praxio downloads distribution

Terraform module that stands up the production distribution host for Praxio:

- Private S3 bucket `praxio-downloads` (no public ACLs, TLS-only, versioning + SSE).
- CloudFront distribution fronted by `downloads.praxio.app`, ACM cert in `us-east-1`,
  cache behaviour tuned for large binaries.
- DNS records for `downloads.praxio.app` (Route53 mode) **or** the CNAMEs you need
  to add yourself (external-DNS mode).
- GitHub Actions OIDC provider + IAM role scoped to write under `/stable/` only,
  trust policy locked to `Azul-Digital-Partners/praxio` + `praxio-release` env.

Issue: [AZU-1835](/AZU/issues/AZU-1835) · Parent plan: [AZU-1832 plan](/AZU/issues/AZU-1832#document-plan)

---

## Prerequisites (one-time, owned by CTO / Steven)

1. **AWS account.** Choose or create the AWS account that will own the Praxio
   downloads distribution. The packaging plan's cost envelope is **$25–50/mo
   target, $100/mo escalation threshold** ([AZU-1832 plan §3.4 + §7](/AZU/issues/AZU-1832#document-plan)).
2. **Bootstrap credentials.** A short-lived admin or terraform-bootstrap IAM
   identity that this module can use the first time it runs. We do **not** want
   long-lived AWS access keys living on a dev machine — prefer AWS SSO + a
   named profile (`aws sso login --profile praxio-admin`) or `aws-vault`.
3. **Terraform state backend.** Pick one of:
   - S3 + DynamoDB in the same account (recommended; matches the data
     gravity of the resources we're managing).
   - Terraform Cloud workspace.
   Provide the backend block in `backend.tf` (gitignored unless we settle on
   a shared one).
4. **DNS authority for `praxio.app`.** Confirm whether the zone lives in
   Route53 or somewhere else (Cloudflare, Namecheap, Squarespace …). The
   `dns_provider` variable switches the module's behaviour accordingly.

Until #1 and #4 are answered we cannot `terraform apply`. The module itself is
provider-agnostic about credentials — it picks them up from the standard AWS
provider chain (env vars / SSO / shared config).

---

## Layout

```
infra/praxio-downloads/
  versions.tf              # required providers, region setup, default tags
  variables.tf             # all knobs (bucket name, domain, dns_provider, …)
  main.tf                  # S3 + CloudFront + ACM + bucket policy + DNS + OIDC role
  outputs.tf               # exports: role ARN, distribution ID, validation CNAMEs, …
  terraform.tfvars.example # copy + edit, do not commit real values
  README.md                # this file
```

The module is intentionally a **single root module** rather than a reusable
sub-module — it provisions one named environment (`downloads.praxio.app`) and
there is no plausible second consumer.

---

## Usage

### 1. Initial apply (external-DNS mode — the default)

This is the path we'll use if `praxio.app` lives at Cloudflare/Namecheap/etc.

```sh
cd infra/praxio-downloads
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars — keep dns_provider = "external"

aws sso login --profile praxio-admin           # or aws-vault exec praxio-admin
export AWS_PROFILE=praxio-admin

terraform init
terraform plan -out praxio-downloads.tfplan
terraform apply praxio-downloads.tfplan
```

After the first apply the ACM cert will be in `PENDING_VALIDATION`. Terraform
will block on `aws_acm_certificate_validation.downloads` for up to 60 minutes.
**Inside that window, do this in another shell:**

```sh
terraform output -json acm_validation_records
```

The output is a JSON array of `{ name, type, value }` records. Add each as a
**CNAME** in your praxio.app DNS provider (TTL 300s is fine). Within a few
minutes ACM issues the cert and Terraform proceeds.

Once the apply finishes, point `downloads.praxio.app` at the CloudFront alias.
Provider-specific instructions:

- **Cloudflare:** create a CNAME `downloads → <terraform output cloudfront_domain_name>` ,
  proxy status **DNS-only** (grey cloud). Cloudflare's orange-cloud proxy in front
  of CloudFront breaks the OAC signing path.
- **Namecheap / generic DNS:** create a CNAME `downloads.praxio.app →
  <cloudfront_domain_name>`. (Namecheap supports CNAME at apex via flattening
  if you ever need it elsewhere; not relevant here since `downloads` is a
  subdomain.)
- **DNS provider with ALIAS/ANAME support:** use that record type with the
  CloudFront domain — gets you IPv6 implicitly.

### 2. Initial apply (Route53 mode)

If the zone lives in Route53:

```sh
# edit terraform.tfvars
dns_provider    = "route53"
route53_zone_id = "Z0123456789ABCDEF"  # from `aws route53 list-hosted-zones`

terraform init
terraform apply
```

In this mode the module creates the cert-validation CNAMEs and the
A/AAAA alias records itself; no manual DNS steps.

### 3. After apply — wire up GitHub Actions

```sh
terraform output github_oidc_role_arn
# arn:aws:iam::<account-id>:role/praxio-release-github-oidc

terraform output cloudfront_distribution_id
# E1XXXXXXXXXXXX
```

In the **`Azul-Digital-Partners/praxio` GitHub repo**:

1. Settings → Environments → create `praxio-release` (the same env named in
   plan §1.3). Add required reviewers if you want manual gating on
   first use.
2. Add environment-scoped variables (no secret needed; this is just an ARN):
   - `AWS_OIDC_ROLE_ARN` → role ARN from above
   - `AWS_REGION` → `us-east-1`
   - `PRAXIO_DOWNLOADS_BUCKET` → `praxio-downloads`
   - `PRAXIO_CLOUDFRONT_DISTRIBUTION_ID` → distribution ID from above
3. The capability check workflow at
   `.github/workflows/praxio-downloads-oidc-check.yml` already references these.
   Run it once via `workflow_dispatch` against the `praxio-release` environment
   — it verifies the OIDC role can `PutObject` under `/stable/` and **cannot**
   `PutObject` under other prefixes.

---

## Day-2 operations

### Probe file (acceptance criteria)

After the first apply we need a probe object so `curl https://downloads.praxio.app/stable/probe.txt`
succeeds. Either:

- Run the capability check workflow (it uploads a probe under
  `/stable/probe-<run>.txt`), or
- One-time from a dev machine with admin creds:

  ```sh
  echo "praxio downloads probe — $(date -u +%FT%TZ)" > /tmp/probe.txt
  aws s3 cp /tmp/probe.txt s3://praxio-downloads/stable/probe.txt --content-type text/plain
  curl -fsSI https://downloads.praxio.app/stable/probe.txt
  ```

### Adding new prefixes

Currently only `/stable/` is writable by the release role. If we add `/beta/`,
update `release_prefix` to a list (will require a small variable/policy refactor)
and re-apply.

### Lifecycle / pruning

**Out of scope per [AZU-1832 plan §3](/AZU/issues/AZU-1832#document-plan).**
Pruning is a manual Rosalind decision. No S3 lifecycle rules are managed here.

### Cost monitoring

Tag-based monthly budget alert is **not** managed in this module — set it up
separately (or wire it into a higher-level org-billing module) so the alert is
not torn down if this module is destroyed.

Recommended budget rule:

- Filter: `tag:Project = praxio` AND `tag:Component = downloads-distribution`
- Threshold: alert at 80% of $100/mo, ping `@Rosalind` per
  [AZU-1832 plan §7 risks](/AZU/issues/AZU-1832#document-plan).

### CloudFront access logs

Logs are written to the same bucket under `_cf-logs/`. They are **not** served
via CloudFront (only `/stable/*` is mapped through the OAC path implicitly via
`s3:GetObject`, and logs sit outside that prefix). If you want them
out-of-band, point logging at a separate `praxio-logs` bucket in a follow-on
change.

---

## Acceptance checklist (AZU-1835)

- [ ] `terraform apply` clean, no drift on second run.
- [ ] Probe object: `curl -fsSI https://downloads.praxio.app/stable/probe.txt`
      returns `200`.
- [ ] OIDC capability check workflow passes on `workflow_dispatch` against
      `praxio-release` environment.
- [ ] OIDC role **cannot** write to `/beta/` or `/` (negative test asserted in
      the workflow).
- [ ] Minisign key custody documented at
      [`docs/praxio-release-keys.md`](../../docs/praxio-release-keys.md).
- [ ] Monthly cost projection logged in the AZU-1835 thread; alert configured.
