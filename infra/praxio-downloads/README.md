# `infra/praxio-downloads` — Praxio downloads distribution

Provisioning for the production downloads CDN at `downloads.praxio.app`.

- Private DigitalOcean Spaces bucket `praxio-downloads` (versioning on, private ACL,
  no public-read at the bucket — DO CDN is the public surface).
- DigitalOcean CDN fronting the Space with custom domain `downloads.praxio.app`
  and a DO-managed Let's Encrypt certificate (auto-renewed).
- A DO Spaces access key stored in the `praxio-release` GitHub environment with
  required-reviewer protection (the substitute for AWS OIDC + prefix-scoped IAM —
  see "Key scoping trade-off" below).

Issue: [AZU-1850](/AZU/issues/AZU-1850) (replaces [AZU-1835](/AZU/issues/AZU-1835)).
Architecture rationale: [AZU-1846 plan](/AZU/issues/AZU-1846#document-plan).

---

## Why DO Spaces + DO CDN (not AWS)

Per CEO ruling on [AZU-1846](/AZU/issues/AZU-1846#comment-c81513de-530d-429e-94fc-a9ced4a8198e),
the downloads CDN runs on DigitalOcean instead of AWS:

- Azul already pays DO; `doctl` is installed and authenticated on the agent fleet.
- DO Spaces is S3-compatible — the codepath that uploads release artifacts uses
  `@aws-sdk/client-s3` already, no changes needed beyond endpoint + credentials.
- DO CDN supports custom domains + free DO-managed Let's Encrypt certs.
- Stays inside the [AZU-1832](/AZU/issues/AZU-1832) budget envelope. Projected
  cost: **~$5–15/mo** ($5 Spaces base + CDN egress at $0.01/GB).
- Avoids the irreducible Steven step required to onboard AWS as a new vendor
  (root account creation, MFA, ToS, billing).

Previous (AWS) architecture lived at this same path until the commit before
AZU-1850. The Terraform module (`main.tf`, `variables.tf`, `outputs.tf`,
`versions.tf`, `terraform.tfvars.example`) and the AWS OIDC workflow have been
removed.

---

## Layout

```
infra/praxio-downloads/
  bootstrap.sh   # idempotent provisioning script (doctl + aws s3 against Spaces)
  README.md      # this file
```

That is the entire module. No Terraform, no state file, no remote backend.

CTO decision (AZU-1850): we provision exactly one environment
(`downloads.praxio.app`) that will never be templated for a second environment.
Terraform's value — drift detection, multi-env, plan/apply — does not pay for
its maintenance cost on a single shell script's worth of resources. `doctl`
calls plus a couple of `aws s3api` calls against Spaces (S3-compatible) cover
it cleanly.

---

## Prerequisites

One-time:

1. **DigitalOcean team account** with billing enabled. Same team that runs the
   existing Azul OS droplets.
2. **`doctl` authenticated** on the runner: `doctl auth init` (≥ v1.119 for
   `doctl spaces keys`).
3. **An admin Spaces access key pair** — used only at bootstrap time to create
   the bucket / set versioning. Mint one from the DO control panel
   (`Settings → Spaces Keys → Generate New Key`) and export it as:
   - `DO_SPACES_ACCESS_KEY_ID`
   - `DO_SPACES_SECRET_ACCESS_KEY`
4. **Required runner tools**: `aws` (CLI), `jq`, `curl`, `host`.

DNS authority for `praxio.app` lives at Porkbun — owned by Rosalind. CNAME
publication for `downloads.praxio.app` is tracked in
[AZU-1842](/AZU/issues/AZU-1842) (target now points to a DO CDN endpoint, not
CloudFront).

---

## Provisioning

The script is two-phase because DO Let's Encrypt certs require the target
domain to resolve to a DO resource before issuance. Phase 1 creates the bucket
and the CDN (returns the CDN endpoint). Rosalind publishes the CNAME. Phase 2
issues the LE cert and attaches the custom domain.

### Phase 1 — bucket + CDN (no custom domain yet)

```sh
cd infra/praxio-downloads

export DO_SPACES_REGION=nyc3
export DO_SPACES_BUCKET=praxio-downloads
export DOWNLOADS_DOMAIN=downloads.praxio.app
export DO_SPACES_ACCESS_KEY_ID=...        # admin Spaces key
export DO_SPACES_SECRET_ACCESS_KEY=...

./bootstrap.sh up
```

The script prints the CDN endpoint (`<id>.cdn.digitaloceanspaces.com`) — hand
it to Rosalind for [AZU-1842](/AZU/issues/AZU-1842).

### Pause for DNS

Rosalind publishes:

```
downloads.praxio.app   CNAME   <cdn-id>.cdn.digitaloceanspaces.com
```

Wait for resolution:

```sh
dig +short downloads.praxio.app
# expect: <cdn-id>.cdn.digitaloceanspaces.com.
```

### Phase 2 — LE cert + custom domain

```sh
./bootstrap.sh attach-domain
```

DO issues the LE cert via HTTP-01 against the CDN edge, then attaches the
custom domain to the CDN. Auto-renews from then on (no human in the loop).

### Verify

```sh
curl -fsSI https://downloads.praxio.app/stable/probe.txt
# (404 until the capability-check workflow uploads one)
```

### Re-runs

`./bootstrap.sh up`, `attach-domain`, and `create-key` are all idempotent.
Each checks for the existing resource (by bucket name, CDN origin, or cert
name) before creating. Re-running is the supported way to "apply" any config
drift.

```sh
./bootstrap.sh status     # shows what's provisioned, what's missing
./bootstrap.sh outputs    # JSON: bucket / region / cdn id / cdn endpoint / cert id
```

---

## GitHub Actions wiring

The `praxio-release` GitHub environment carries the release-time credentials.

### 1. Mint a release-only Spaces key

```sh
./bootstrap.sh create-key praxio-release
```

This prints the access key id + secret **once**. Store them immediately in the
GitHub repository:

`Settings → Environments → praxio-release → Add secret`:

| Name                          | Value                                |
| ----------------------------- | ------------------------------------ |
| `DO_SPACES_ACCESS_KEY_ID`     | from `create-key` output             |
| `DO_SPACES_SECRET_ACCESS_KEY` | from `create-key` output             |

### 2. Environment variables (non-secret)

`Settings → Environments → praxio-release → Add variable`:

| Name                | Value                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| `DO_SPACES_REGION`  | `nyc3`                                                                 |
| `DO_SPACES_BUCKET`  | `praxio-downloads`                                                     |
| `DO_CDN_ENDPOINT`   | `<cdn-id>.cdn.digitaloceanspaces.com` (from `./bootstrap.sh outputs`)  |

### 3. Environment protection

Enable **Required reviewers** on the `praxio-release` environment. This is
the human gate that replaces AWS OIDC's signed federation.

### 4. Run the capability check

`.github/workflows/praxio-downloads-spaces-check.yml` is triggered via
`workflow_dispatch`. On dispatch:

- Asserts `head-bucket` works with the release key.
- Uploads `stable/probe-<run>.txt` and `stable/probe-latest.txt`.
- Asserts the workflow source itself never writes outside `/stable/`
  (workflow-level guard — see trade-off below).
- Curls `https://downloads.praxio.app/stable/probe-<run>.txt` to confirm the
  CDN serves it.
- Cleans up the per-run probe (keeps `probe-latest.txt` if `keep_probe`).

---

## Key scoping trade-off (read this)

AWS S3 + IAM OIDC let us scope the release role to `s3:PutObject` under
`/stable/` only at the **server side**. A leaked OIDC role would still be
rejected by AWS when attempting to write to `/beta/` or `/`.

**DigitalOcean Spaces does not support per-key prefix scoping.** A Spaces
access key can read/write any object in any bucket the key was created for —
there is no "this key is allowed to write only under /stable/" expression in
the IAM model.

The substitute controls we ship instead:

1. **GitHub environment isolation.** The release key lives only in the
   `praxio-release` environment. No other workflow, branch, or job can read
   it without first triggering a `praxio-release`-scoped job.
2. **Required reviewers on the environment.** A human approval is required
   before any workflow run can attach the environment and therefore see the
   secret.
3. **Workflow-level negative guard.** The capability-check workflow scans its
   own source for `s3 cp` / `put-object` steps that target keys outside
   `stable/` and fails if any exist. This catches accidental code changes,
   not malicious actors with the key in hand.
4. **Key rotation.** Treat the release key as rotateable: any sign of compromise
   → revoke in DO and re-mint via `./bootstrap.sh create-key`. There is no role
   ARN to update; only the two GH env secrets.

If we ever need true server-side prefix enforcement, the options are:

- Switch to **GitHub Releases + Cloudflare Worker** (fallback B2 per
  [AZU-1846](/AZU/issues/AZU-1846#document-plan)) — CTO has CEO pre-authority
  to pivot without re-escalation.
- Run a signed-URL gateway in front of the Space and never expose the Spaces
  key to GH at all. Adds an Azul OS service — substantial complexity for
  the current scope.

We accepted (1)–(4) for now. Re-evaluate if a future use case requires the
key to write under additional prefixes (`/beta/`, etc.).

---

## Day-2 operations

### Adding a new prefix (e.g. `/beta/`)

No infra change needed. Update the publish path in the release workflow
(`praxio-release.yml`). The release key has no enforced prefix; the negative
guard in the capability-check workflow only inspects that workflow's source.

### Lifecycle / pruning

**Out of scope** per [AZU-1832 plan §3](/AZU/issues/AZU-1832#document-plan).
Pruning is a manual Rosalind decision. DO Spaces does support S3-style
lifecycle rules if we ever want them — wire via
`aws s3api put-bucket-lifecycle-configuration` against the Spaces endpoint.

### Cost monitoring

DO does not have AWS Budgets. Substitutes:

- Set a **billing alert** on the DO team account
  (`Settings → Billing → Billing alerts`) at $40/mo, escalating to Rosalind.
- The Spaces base ($5) + 50 GB egress ($0.50) is the lower bound. The cost
  driver is total monthly egress.

### CDN cache purge after a release

DO CDN supports targeted purges via the DO API (not the Spaces key):

```sh
curl -X DELETE \
  -H "Authorization: Bearer $DIGITALOCEAN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.digitalocean.com/v2/cdn/endpoints/$(./bootstrap.sh outputs | jq -r .do_cdn_id)/cache" \
  --data '{"files":["/stable/latest.dmg","/stable/latest.dmg.minisig"]}'
```

If the release workflow needs purge, wire `DIGITALOCEAN_ACCESS_TOKEN` as an
environment secret. The capability-check workflow does **not** rely on this —
it sets `Cache-Control: no-store` on the probe to bypass the issue.

---

## Acceptance checklist (translated from AZU-1835 → AZU-1850)

- [ ] `./bootstrap.sh up` runs clean; second run is a no-op (idempotent).
- [ ] `./bootstrap.sh attach-domain` succeeds after Rosalind publishes the CNAME.
- [ ] `curl -fsSI https://downloads.praxio.app/stable/probe.txt` returns `200`
      after the capability-check workflow uploads a probe.
- [ ] `.github/workflows/praxio-downloads-spaces-check.yml` passes on
      `workflow_dispatch` against the `praxio-release` environment.
- [ ] Scoped-write trade-off documented (see "Key scoping trade-off" above).
- [ ] Minisign key custody documented at
      [`docs/praxio-release-keys.md`](../../docs/praxio-release-keys.md) (unchanged).
- [ ] Monthly cost projection logged in [AZU-1850](/AZU/issues/AZU-1850) thread;
      billing alert configured at the DO control panel.

---

## Fallback authority

Per CEO ruling on [AZU-1846](/AZU/issues/AZU-1846#comment-c81513de-530d-429e-94fc-a9ced4a8198e):
if DO Spaces+CDN hits a real blocker during operation (LE cert issuance
broken, GH Actions auth story unworkable, etc.), CTO may pivot unilaterally
to **B2 (GitHub Releases + Cloudflare Worker)**. Do **not** pivot to AWS
without re-escalating to CEO.
