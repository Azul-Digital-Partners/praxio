#!/usr/bin/env node
/**
 * electron-builder afterSign hook — submit the signed .app to Apple notarytool.
 *
 * Credentials are read from a sourced env file (default
 * `~/.azul/signing/praxio/notarytool.env`) or from the process environment:
 *
 *   NOTARYTOOL_KEY_ID      — App Store Connect API Key ID
 *   NOTARYTOOL_ISSUER_ID   — App Store Connect Issuer ID (team-wide UUID)
 *   NOTARYTOOL_KEY_PATH    — Path to the AuthKey_*.p8 file (mode 600)
 *   APPLE_TEAM_ID          — Developer Team ID
 *
 * If any required credential is missing, the hook logs a warning and exits
 * cleanly (no notarization) so that scaffolding-only builds still produce a
 * .dmg artifact. Production builds must have all four values set.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { homedir } from "node:os";
import { notarize } from "@electron/notarize";

const DEFAULT_ENV_FILE = resolvePath(homedir(), ".azul/signing/praxio/notarytool.env");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Expand $HOME / ${HOME}.
    value = value
      .replace(/\$HOME/g, homedir())
      .replace(/\$\{HOME\}/g, homedir());
    env[key] = value;
  }
  return env;
}

/** @type {import('electron-builder').AfterPackContext} */
export default async function afterSign(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const fileEnv = loadEnvFile(process.env.NOTARYTOOL_ENV_FILE ?? DEFAULT_ENV_FILE);
  const cred = {
    keyId:    process.env.NOTARYTOOL_KEY_ID    ?? fileEnv.NOTARYTOOL_KEY_ID,
    issuerId: process.env.NOTARYTOOL_ISSUER_ID ?? fileEnv.NOTARYTOOL_ISSUER_ID,
    keyPath:  process.env.NOTARYTOOL_KEY_PATH  ?? fileEnv.NOTARYTOOL_KEY_PATH,
    teamId:   process.env.APPLE_TEAM_ID        ?? fileEnv.APPLE_TEAM_ID,
  };

  const missing = Object.entries(cred)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.warn(
      `[notarize] skipping — missing credentials: ${missing.join(", ")}. ` +
        `Set them in env or ${DEFAULT_ENV_FILE}.`,
    );
    return;
  }

  if (!existsSync(cred.keyPath)) {
    console.warn(`[notarize] skipping — key file not found at ${cred.keyPath}`);
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[notarize] submitting ${appPath} to Apple (teamId=${cred.teamId}, keyId=${cred.keyId})`);
  const t0 = Date.now();
  try {
    await notarize({
      tool: "notarytool",
      appPath,
      appleApiKey: cred.keyPath,
      appleApiKeyId: cred.keyId,
      appleApiIssuer: cred.issuerId,
      teamId: cred.teamId,
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[notarize] succeeded for ${appName} in ${elapsed}s`);
  } catch (err) {
    console.error(`[notarize] FAILED for ${appName}:`, err);
    throw err;
  }
}
