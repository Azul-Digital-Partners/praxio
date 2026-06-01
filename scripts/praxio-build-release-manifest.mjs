#!/usr/bin/env node
// praxio-build-release-manifest.mjs — emit the signed release manifest for a
// Praxio production build (AZU-1838 / [AZU-1832] plan §5).
//
// Walks `dist-electron/` for `Praxio-*.dmg`, computes SHA-512 + byte size for
// each, captures build provenance (git SHA, build timestamp, runner image
// SHA, Electron/Node/pnpm versions), hashes the CycloneDX SBOM file, and
// writes `praxio-release-manifest-<version>.json` into the dist directory.
// The minisign signing step in `.github/workflows/praxio-release.yml`
// consumes that JSON as its `-m` input.
//
// Usage:
//   node scripts/praxio-build-release-manifest.mjs \
//     --dist-dir dist-electron \
//     --sbom dist-electron/sbom-<version>.cdx.json \
//     --out dist-electron/praxio-release-manifest-<version>.json
//
// Required env (best-effort fallbacks for local dry runs):
//   GITHUB_SHA          — git SHA of the build commit
//   GITHUB_REF          — refs/tags/praxio-v<calver> when triggered by a tag
//   GITHUB_RUN_ID       — CI run id (recorded for traceability)
//   ImageOS / ImageVersion — GitHub-hosted runner image identifiers
//                            (recorded as the runner image SHA surrogate)
//
// Exits non-zero if no DMGs are found or the SBOM file is missing/unreadable.

import { createHash } from "node:crypto";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { execSync } from "node:child_process";

function parseArgs(argv) {
  const out = { distDir: "dist-electron", sbom: null, outFile: null };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--dist-dir") {
      out.distDir = v;
      i++;
    } else if (k === "--sbom") {
      out.sbom = v;
      i++;
    } else if (k === "--out") {
      out.outFile = v;
      i++;
    } else if (k === "--help" || k === "-h") {
      console.log(
        "usage: praxio-build-release-manifest.mjs --dist-dir <dir> --sbom <sbom.json> --out <manifest.json>",
      );
      process.exit(0);
    } else {
      console.error(`::error::unknown argument: ${k}`);
      process.exit(2);
    }
  }
  return out;
}

function hashFile(path, algo) {
  return new Promise((resolveP, rejectP) => {
    const h = createHash(algo);
    const stream = createReadStream(path);
    stream.on("error", rejectP);
    stream.on("data", (chunk) => h.update(chunk));
    stream.on("end", () => resolveP(h.digest("hex")));
  });
}

function tryExec(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function readVersion() {
  // electron/package.json is the source of truth for the Praxio version
  // (matches scripts/praxio-release.sh tag derivation).
  const pkg = JSON.parse(readFileSync("electron/package.json", "utf8"));
  if (!pkg.version) {
    throw new Error("electron/package.json has no .version");
  }
  return pkg.version;
}

function readToolVersion(name, fallbackCmd) {
  // Prefer explicit version strings the CI can pass through env so we record
  // what was actually used, with `fallbackCmd` as a sanity probe.
  const envKey = `PRAXIO_${name.toUpperCase()}_VERSION`;
  if (process.env[envKey]) return process.env[envKey];
  if (!fallbackCmd) return null;
  const v = tryExec(fallbackCmd);
  return v || null;
}

async function main() {
  const args = parseArgs(process.argv);

  const version = readVersion();
  const distDir = resolve(args.distDir);
  const sbomPath = args.sbom ? resolve(args.sbom) : null;
  const outPath = args.outFile
    ? resolve(args.outFile)
    : join(distDir, `praxio-release-manifest-${version}.json`);

  // --- DMG enumeration ---------------------------------------------------
  const entries = await readdir(distDir).catch((err) => {
    console.error(`::error::cannot read dist dir ${distDir}: ${err.message}`);
    process.exit(1);
  });
  const dmgs = entries.filter((f) => f.endsWith(".dmg")).sort();
  if (dmgs.length === 0) {
    console.error(`::error::no .dmg files found under ${distDir}`);
    process.exit(1);
  }

  const artifacts = [];
  for (const name of dmgs) {
    const full = join(distDir, name);
    const st = await stat(full);
    const sha512 = await hashFile(full, "sha512");
    // Infer arch from electron-builder's default name pattern
    //   Praxio-<version>-arm64.dmg  /  Praxio-<version>.dmg (x64 default)
    let arch = "x64";
    if (/-arm64\.dmg$/i.test(name)) arch = "arm64";
    artifacts.push({
      file: name,
      arch,
      bytes: st.size,
      sha512,
    });
  }

  // --- SBOM hash ---------------------------------------------------------
  let sbom = null;
  if (sbomPath) {
    try {
      const sbomBytes = readFileSync(sbomPath);
      sbom = {
        file: basename(sbomPath),
        bytes: sbomBytes.length,
        sha256: createHash("sha256").update(sbomBytes).digest("hex"),
        spec: "CycloneDX",
      };
      // Pull the CycloneDX spec version from the file itself when possible.
      try {
        const sbomJson = JSON.parse(sbomBytes.toString("utf8"));
        if (sbomJson.specVersion) sbom.specVersion = sbomJson.specVersion;
      } catch {
        // Non-JSON SBOM is unexpected but not fatal — leave specVersion off.
      }
    } catch (err) {
      console.error(`::error::cannot read SBOM ${sbomPath}: ${err.message}`);
      process.exit(1);
    }
  }

  // --- Provenance --------------------------------------------------------
  const gitSha =
    process.env.GITHUB_SHA || tryExec("git rev-parse HEAD") || null;
  const gitRef = process.env.GITHUB_REF || null;
  const runId = process.env.GITHUB_RUN_ID || null;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT || null;
  const runnerImageOs = process.env.ImageOS || null;
  const runnerImageVersion = process.env.ImageVersion || null;

  const electronVersion = readToolVersion(
    "electron",
    "node -p \"require('./electron/package.json').devDependencies?.electron || require('./electron-builder.yml')\"",
  );
  // node and pnpm: prefer env, fall back to live probes.
  const nodeVersion =
    process.env.PRAXIO_NODE_VERSION || process.version || null;
  const pnpmVersion = readToolVersion("pnpm", "pnpm --version");

  const manifest = {
    schema: "praxio.release-manifest/v1",
    product: "Praxio",
    version,
    generatedAt: new Date().toISOString(),
    build: {
      gitSha,
      gitRef,
      runId,
      runAttempt,
      runnerImage: {
        os: runnerImageOs,
        version: runnerImageVersion,
      },
      tooling: {
        electron: electronVersion,
        node: nodeVersion,
        pnpm: pnpmVersion,
      },
    },
    artifacts,
    sbom,
  };

  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`wrote ${outPath}`);
  console.log(
    `  version=${version} dmgs=${artifacts.length} sbom=${sbom ? sbom.file : "<none>"}`,
  );
}

main().catch((err) => {
  console.error(`::error::${err.stack || err.message || err}`);
  process.exit(1);
});
