# `infra/praxio-downloads` — Praxio downloads distribution

DigitalOcean Spaces + DigitalOcean CDN that fronts `downloads.praxio.app`.

- Private Spaces bucket `praxio-downloads` (region `nyc3`, versioning on,
  no public ACLs).
- DO CDN fronting the bucket with custom domain `downloads.praxio.app` and a
  DO-managed Let's Encrypt certificate (auto-issued, auto-renewed).
- Release uploads from GitHub Actions use a DO Spaces access key stored in
  the `praxio-release` environment.

Tracking: [AZU-1850](/AZU/issues/AZU-1850) (this module) ·
[AZU-1842](/AZU/issues/AZU-1842) (Porkbun CNAME publication) ·
[AZU-1835](/AZU/issues/AZU-1835) (parent deliverable) ·
[AZU-1832 plan](/AZU/issues/AZU-1832#document-plan) (cost + scope envelope).

---

## Why DigitalOcean (and not AWS)

Selected by CEO ruling on
[AZU-1846](/AZU/issues/AZU-1846#comment-c81513de-530d-429e-94fc-a9ced4a8198e):

- Azul already pays DigitalOcean; `doctl` is installed and authenticated on
  the agent fleet, so there is no new-vendor bootstrap step.
- DO Spaces is S3-compatible — the same `@aws-sdk/client-s3` Azul OS already
  ships works against it.
- DO CDN supports a custom domain plus a free DO-managed Let's Encrypt
  certificate, so the user-visible host stays `downloads.praxio.app`.
- Stays well inside the [AZU-1832 plan §3.4](/AZU/issues/AZU-1832#document-plan)
  cost envelope ($25–50/mo target, $100/mo escalation). Actual run-rate is
  ~$5–15/mo (Spaces $5/mo + CDN egress @ $0.01/GB).
- Avoids the irreducible Steven step required to bootstrap a new AWS account
  (root, MFA, ToS).

Per the CEO ruling the CTO retains unilateral authority to pivot to **B2**
(GitHub Releases + Cloudflare Worker free tier) if DO hits a real blocker —
record the reason in the issue thread. **Do not** pivot back to AWS without
re-escalating to the CEO.

---

## Prerequisites (one-time, owned by CTO / Steven)

1. **DigitalOcean account access.** Same team account that already owns the
   Praxio + Azul OS droplets. `doctl auth list` should already show a
   working context on agent machines.
2. **DO Spaces access key.** Generated from the DO control panel under
   *Spaces → Access Keys*. DO Spaces does **not** support prefix-scoped keys
   the way AWS IAM does — see *Scoped writes / trade-off* below.
3. **DNS authority for `praxio.app`.** The zone lives at Porkbun. Rosalind
   owns publishing the CNAME on [AZU-1842](/AZU/issues/AZU-1842) once this
   module emits the `do_cdn_endpoint` output. Only **one** Porkbun CNAME is
   required — DO CDN auto-issues + auto-renews the Let's Encrypt cert from
   that domain.

---

## Layout

```
infra/praxio-downloads/
  bootstrap.sh   # idempotent doctl + aws (Spaces) script — primary entry point
  README.md      # this file
```

Per CTO recommendation we ship a single shell script rather than Terraform
or Pulumi. The module provisions exactly one environment, will never scale
to many, and `doctl` + the S3 API are the lowest-overhead path. Drift
detection comes from re-running `bootstrap.sh` (idempotent) and from the
capability-check workflow.

---

## Usage

### 1. First bootstrap

```sh
cd infra/praxio-downloads

# DO Spaces access key — from DO control panel → Spaces → Access Keys.
# Treat these like AWS keys; do not commit, do not paste into agent memory.
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

# doctl must already be authenticated against the Azul team account:
#   doctl auth init   (one-time, interactive)

./bootstrap.sh
```

The script:

1. Creates the `praxio-downloads` Spaces bucket in `nyc3` (private ACL,
   versioning enabled).
2. Creates a Let's-Encrypt certificate named `praxio-downloads-cert` for
   `downloads.praxio.app` via `doctl compute certificate create
   --type lets_encrypt`.
3. Creates the DO CDN distribution fronting the Spaces origin, binds the
   certificate, sets `downloads.praxio.app` as the custom domain.
4. Prints the outputs needed for both the GitHub Actions environment and
   the Porkbun CNAME.

**Chicken-and-egg note:** DO's Let's Encrypt issuance requires the custom
domain to resolve to the CDN endpoint. On a brand-new bootstrap that
endpoint does not exist until step 3, and the Porkbun CNAME cannot be
published until then either. The expected flow is:

1. First `./bootstrap.sh` run — bucket + cert request + CDN distribution
   are created. The cert may sit in `pending` and the CDN may not serve TLS
   until the CNAME exists at Porkbun.
2. Capture `do_cdn_endpoint` from the script output. Post it on
   [AZU-1850](/AZU/issues/AZU-1850) so Rosalind can land the Porkbun CNAME
   on [AZU-1842](/AZU/issues/AZU-1842).
3. Once the CNAME is live, re-run `./bootstrap.sh` (idempotent) — the
   certificate completes issuance, the CDN serves TLS.

### 2. Re-runs / drift recovery

`bootstrap.sh` is idempotent. Every step checks for existing resources by
name/origin and skips creation when present. To reapply config (e.g. TTL
changes), edit the script and re-run.

### 3. Wire up GitHub Actions

In the **`Azul-Digital-Partners/praxio`** repo, create (or update) the
`praxio-release` environment with these variables / secrets:

| Kind     | Name                          | Value                                                          |
| -------- | ----------------------------- | -------------------------------------------------------------- |
| Variable | `DO_SPACES_REGION`            | `nyc3`                                                         |
| Variable | `DO_SPACES_BUCKET`            | `praxio-downloads`                                             |
| Variable | `DO_SPACES_ENDPOINT`          | `https://nyc3.digitaloceanspaces.com`                          |
| Variable | `DO_CDN_ID`                   | from `bootstrap.sh` output                                     |
| Variable | `DO_CDN_ENDPOINT`             | from `bootstrap.sh` output (`*.cdn.digitaloceanspaces.com`)    |
| Secret   | `DO_SPACES_ACCESS_KEY_ID`     | DO Spaces access key id                                         |
| Secret   | `DO_SPACES_SECRET_ACCESS_KEY` | DO Spaces secret access key                                     |

Then run `.github/workflows/praxio-downloads-spaces-check.yml` via
`workflow_dispatch`. It uploads a probe to `/stable/`, verifies the CDN
serves it at `https://downloads.praxio.app/stable/...`, and asserts the
workflow-level scoped-writes guarantee (see next section).

---

## Scoped writes / trade-off

AWS IAM lets us scope an OIDC role's `s3:PutObject` to a single prefix at
the IAM-policy layer, so a malicious workflow on a feature branch literally
cannot write outside `/stable/`. DO Spaces does **not** support prefix
scoping at the access-key layer — a Spaces key is bucket-wide.

The substitute is workflow-level + environment-protection:

- The DO Spaces secrets live **only** on the `praxio-release` GitHub
  environment (not at the repo or org level).
- The `praxio-release` environment is configured with a required reviewer
  and protected branch rules (release-tags only).
- The capability-check workflow asserts the runner only writes under
  `/stable/` by attempting writes under `/beta/` and bucket-root, then
  cleaning them up if they incorrectly succeed (treated as a workflow
  failure that pages on-call).

This is weaker than AWS prefix-scoped IAM. The compensating controls are
documented here, in
[`docs/praxio-release-keys.md`](../../docs/praxio-release-keys.md), and in
the capability-check workflow. Rotation of the Spaces key is a manual step
in the DO control panel; cadence stays with Rosalind / CTO per
[AZU-716](/AZU/issues/AZU-716) (Phase C).

---

## Day-2 operations

### Probe file (acceptance criteria)

After the CNAME publication, verify:

```sh
curl -fsSI https://downloads.praxio.app/stable/probe.txt
```

Either upload the probe by running the capability-check workflow (it
refreshes `/stable/probe-latest.txt`) or, from a dev machine with the DO
Spaces key exported:

```sh
echo "praxio downloads probe — $(date -u +%FT%TZ)" > /tmp/probe.txt
aws s3 cp /tmp/probe.txt s3://praxio-downloads/stable/probe.txt \
  --endpoint-url https://nyc3.digitaloceanspaces.com \
  --content-type text/plain
```

### Cache invalidation

```sh
doctl compute cdn flush "${DO_CDN_ID}" \
  --files /stable/probe.txt /stable/praxio-release-manifest-latest.json
```

The release pipeline issues a flush automatically after publishing a
release.

### Adding new prefixes

Only `/stable/` is in use today. Adding `/beta/` is an InfoSec-loop change:
update the capability-check workflow to expect `/beta/` writes to **also**
succeed, and update the protected environment rules accordingly.

### Lifecycle / pruning

**Out of scope** per
[AZU-1832 plan §3](/AZU/issues/AZU-1832#document-plan). DO Spaces supports
lifecycle rules; we will configure them in a follow-on issue when
retention pressure shows up.

### Cost monitoring

DigitalOcean does not have an AWS-Budgets equivalent. Configure a billing
alert on the Azul team account (Account → Billing → Alerts) at 80% of
$100/mo, pinging Rosalind per
[AZU-1832 plan §7 risks](/AZU/issues/AZU-1832#document-plan).

---

## Acceptance checklist (translated from AZU-1835)

- [ ] `./bootstrap.sh` runs clean, idempotent on re-run.
- [ ] Probe object: `curl -fsSI https://downloads.praxio.app/stable/probe.txt`
      returns `200` after Rosalind publishes the Porkbun CNAME.
- [ ] Capability check workflow passes on `workflow_dispatch` against the
      `praxio-release` environment.
- [ ] Scoped-writes trade-off documented (this file + workflow comments).
- [ ] Minisign key custody unchanged — see
      [`docs/praxio-release-keys.md`](../../docs/praxio-release-keys.md).
- [ ] Monthly cost projection logged in
      [AZU-1850](/AZU/issues/AZU-1850); DO billing alert configured.

---

## Migrating from the old AWS module

If you came here looking for the old Terraform + S3 + CloudFront + ACM +
OIDC module, it lived at this path through commit `5705879a` and earlier.
The AWS path was retired per CEO ruling on
[AZU-1846](/AZU/issues/AZU-1846#comment-c81513de-530d-429e-94fc-a9ced4a8198e).
Pull from git history if you need it for reference; do not revive it
without a fresh CEO decision.
