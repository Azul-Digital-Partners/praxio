---
title: Praxio release signing keys
summary: Custody, access, and rotation policy for the minisign key that signs Praxio release manifests
---

# Praxio release signing keys

Praxio release artifacts ship with a signed
`praxio-release-manifest-<version>.json` per
[AZU-1832 plan §5](/AZU/issues/AZU-1832#document-plan). The signature is a
[minisign](https://jedisct1.github.io/minisign/) detached signature
(`.minisig`). This doc covers where the **private** half of that key lives
and who can touch it.

## Identity

- **Algorithm:** Ed25519 via minisign.
- **Key purpose:** Sign Praxio release manifests only. Not used for code
  signing (that is Apple Developer ID), not used for SSH, not used for git.
- **Public key URL:** published at
  `https://downloads.praxio.app/minisign.pub` and shown on
  `praxio.app/download` per
  [AZU-1832 plan §5](/AZU/issues/AZU-1832#document-plan).
- **Key ID prefix:** TBD — populated when the key is generated. Record the
  64-bit key ID here on first issue so verification commands embedded in
  user docs can pin it.

## Custody

The **private** key half is stored as a base64-encoded secret inside the
GitHub Actions environment **`praxio-release`** on the
[`Azul-Digital-Partners/praxio`](https://github.com/Azul-Digital-Partners/praxio) repo:

| Secret name                       | Contents                                     |
| --------------------------------- | -------------------------------------------- |
| `PRAXIO_MINISIGN_KEY_BASE64`      | Base64 of `~/.minisign/minisign.key`         |
| `PRAXIO_MINISIGN_KEY_PASSWORD`    | Passphrase for the encrypted minisign key   |

The release workflow decodes the secret to `$RUNNER_TEMP/minisign.key` with
mode `0600`, runs `minisign -S -s … -m praxio-release-manifest.json`, and
deletes the key file in an `always()` cleanup step. The key never lands on
disk on any human's machine after initial generation.

## Who has access

Per [AZU-1838](/AZU/issues/AZU-1838) deliverable 5 (Phase C rotation
deferred per Rosalind's note — AZU-1835 was superseded by [AZU-1850](/AZU/issues/AZU-1850)
when distribution moved from AWS S3/CloudFront to DigitalOcean Spaces + DO CDN):

| Principal             | Access kind                              | Notes                                                                                                      |
| --------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Steven (CEO)**      | Holds the offline emergency-recovery copy | Stored in his 1Password vault entry **Praxio release minisign**. Used only if the GH environment secret is lost. |
| **Rosalind (CTO)**    | Read access to `praxio-release` environment secrets | Can rotate, revoke, and re-issue the key.                                                                  |
| **Praxio Packaging** (this agent) | No direct read; can trigger workflows that consume the secret | Standard Paperclip principle — the agent operates the pipeline but does not see secret values. |

InfoSec is looped in on any change to who can read the environment.

## Generation (one-time, Steven or Rosalind)

```sh
# Local, air-gapped if you're paranoid. macOS:
brew install minisign

mkdir -p ~/.minisign-praxio && cd ~/.minisign-praxio
minisign -G -p minisign.pub -s minisign.key
#   → prompts for a passphrase. Choose a 4-6 word diceware phrase.
#   → store passphrase in 1Password as "Praxio release minisign — passphrase"
#   → store minisign.key   in 1Password as "Praxio release minisign — private key (encrypted)"

# Upload to the praxio-release environment
gh secret set PRAXIO_MINISIGN_KEY_BASE64 \
  --env praxio-release \
  --repo Azul-Digital-Partners/praxio \
  < <(base64 < minisign.key)

gh secret set PRAXIO_MINISIGN_KEY_PASSWORD \
  --env praxio-release \
  --repo Azul-Digital-Partners/praxio

# Publish the public half (anyone can have it — this is the verify side)
# Distribution bucket lives on DigitalOcean Spaces per AZU-1850; doctl is
# already authenticated on the agent fleet, so use s3cmd / aws CLI with the
# DO Spaces endpoint or the doctl spaces command — see AZU-1850 for the
# canonical upload recipe once the bucket is provisioned.
s3cmd put minisign.pub \
  s3://praxio-downloads/minisign.pub \
  --host=nyc3.digitaloceanspaces.com \
  --host-bucket="%(bucket)s.nyc3.digitaloceanspaces.com" \
  --mime-type=text/plain \
  --add-header="Cache-Control: max-age=86400" \
  --acl-public

# Shred local copies once you have confirmed 1Password + GH secret are both populated
shred -u minisign.key  # or: srm minisign.key on macOS via brew install srm
```

Then **update this doc** with the public key fingerprint and the first
`praxio-v*` release that used it.

## Verification (what end users / auditors do)

```sh
brew install minisign
curl -fsSO https://downloads.praxio.app/minisign.pub
curl -fsSO https://downloads.praxio.app/stable/praxio-release-manifest-<version>.json
curl -fsSO https://downloads.praxio.app/stable/praxio-release-manifest-<version>.json.minisig

minisign -V -p minisign.pub \
  -m praxio-release-manifest-<version>.json
```

A successful verify is the proof that the manifest (and therefore the
SHA-512s of the DMGs listed inside it) came from the Praxio release
pipeline.

## Rotation

Deferred to Phase C per Rosalind's note on
[AZU-1838](/AZU/issues/AZU-1838) (originally tracked on the cancelled
[AZU-1835](/AZU/issues/AZU-1835)). When we do it:

1. Generate a new key pair.
2. Publish the new public key alongside the old one for a transition window.
3. Update `praxio.app/download` + this doc to show the new key.
4. Retire the old key after one full release cycle has shipped with the new
   key.

## Loss / compromise playbook

- **Loss (we cannot sign new releases):** restore from the 1Password
  emergency copy → re-upload to the GH environment secret → resume.
- **Compromise (key suspected leaked):** rotate immediately, publish a
  signed `revoked.json` from the new key, notify any user with an
  installed copy via the `praxio.app/download` page banner. Out-of-band
  notification mechanism beyond that is Phase C work.

## Related

- [AZU-1838](/AZU/issues/AZU-1838) — current deliverable (SBOM + minisign-signed manifest)
- [AZU-1835](/AZU/issues/AZU-1835) — original deliverable (cancelled, superseded by AZU-1850)
- [AZU-1850](/AZU/issues/AZU-1850) — DO Spaces distribution bucket that hosts `minisign.pub`
- [AZU-1832 plan §5](/AZU/issues/AZU-1832#document-plan) — provenance model
- [AZU-716](/AZU/issues/AZU-716) — Phase C boundary (rotation lives here)
