#!/usr/bin/env node
/**
 * Bundle the Electron main process with esbuild.
 *
 * Output is ESM (.mjs) because @paperclipai/server uses `import.meta.url`
 * throughout, which is invalid in a CommonJS bundle. Electron supports ESM
 * main processes natively from v28+.
 *
 * Heavy/native modules (electron itself, embedded-postgres, the rest of the
 * server's runtime deps) are kept external — they are resolved at runtime
 * from node_modules. electron-builder will pack node_modules into the
 * app's `app.asar.unpacked` (for native modules) or `app.asar`.
 */
import { build, context } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf8"),
);

const external = [
  "electron",
  // Server deps that have native bindings or load assets at runtime.
  "embedded-postgres",
  "better-sqlite3",
  "@aws-sdk/client-s3",
  // Anything in our own scope can also stay external — pnpm will install it
  // into the packaged node_modules.
  /^@paperclipai\//.source,
];

const watch = process.argv.includes("--watch");

const config = {
  entryPoints: [resolve(__dirname, "src/main.ts")],
  outfile: resolve(__dirname, "dist/main.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  // Mark every workspace + native module external; we ship them in node_modules.
  external: [
    "electron",
    "@paperclipai/server",
    "@paperclipai/db",
    "@paperclipai/adapter-acpx-local",
    "@paperclipai/adapter-claude-local",
    "@paperclipai/adapter-codex-local",
    "@paperclipai/adapter-cursor-cloud",
    "@paperclipai/plugin-sdk",
    "embedded-postgres",
    "better-sqlite3",
    "@aws-sdk/client-s3",
    "detect-port",
    // Common server runtime deps — keep external to avoid pulling them through
    // the bundler. The packaged app's node_modules will have them.
    "express",
    "drizzle-orm",
    "pino",
    "ws",
  ],
  banner: {
    // Provide CJS-style globals that some transitive deps still expect when
    // loaded via dynamic import inside an ESM bundle.
    js: [
      `import { createRequire as __pcCreateRequire } from "node:module";`,
      `import { fileURLToPath as __pcFileURLToPath } from "node:url";`,
      `import { dirname as __pcDirname } from "node:path";`,
      `const require = __pcCreateRequire(import.meta.url);`,
      `const __filename = __pcFileURLToPath(import.meta.url);`,
      `const __dirname = __pcDirname(__filename);`,
    ].join("\n"),
  },
  logLevel: "info",
  metafile: true,
};

if (watch) {
  const ctx = await context(config);
  await ctx.watch();
  // eslint-disable-next-line no-console
  console.log(`[electron] watching ${pkg.name}@${pkg.version}`);
} else {
  await build(config);
  // eslint-disable-next-line no-console
  console.log(`[electron] built ${pkg.name}@${pkg.version} -> dist/main.mjs`);
}
