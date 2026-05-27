#!/usr/bin/env node
/**
 * Bundle the Electron app for shipping.
 *
 * Two outputs:
 *   dist/main.mjs          — Electron main process. Imports `electron`
 *                            (kept external) and forks the server bundle.
 *   dist/server.bundle.mjs — Utility-process entry. Inlines the entire
 *                            `@paperclipai/server` graph and its workspace
 *                            dependencies so the packaged app does not rely
 *                            on pnpm workspace symlinks inside app.asar.
 *
 * Both outputs are ESM (.mjs) because the server uses `import.meta.url`
 * and dynamic `import()` extensively; CommonJS bundles cannot host that.
 *
 * Externals strategy for `server.bundle.mjs`:
 *   - `electron` — only the parent process resolves this; in the utility
 *     process it would crash. Keep external so any stray import fails fast.
 *   - True native modules — `embedded-postgres`, `sharp`, `better-sqlite3`,
 *     and their platform sub-packages (`@embedded-postgres/*`, `@img/*`).
 *     These ship a `.node` binding or a per-arch binary and must be loaded
 *     from the unpacked `node_modules` tree, not inlined into a JS bundle.
 *   - Everything else (express, drizzle, ws, pino, ajv, jsdom, etc., and
 *     all workspace `@paperclipai/*` packages) is inlined.
 */
import { build, context } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, copyFileSync, mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf8"),
);

const watch = process.argv.includes("--watch");

// CJS-style globals expected by some transitive deps when loaded inside an
// ESM bundle (e.g. pino, jsdom). Provided as banners so they are present in
// the very first lines of every bundle.
const cjsShimBanner = [
  `import { createRequire as __pcCreateRequire } from "node:module";`,
  `import { fileURLToPath as __pcFileURLToPath } from "node:url";`,
  `import { dirname as __pcDirname } from "node:path";`,
  `const require = __pcCreateRequire(import.meta.url);`,
  `const __filename = __pcFileURLToPath(import.meta.url);`,
  `const __dirname = __pcDirname(__filename);`,
].join("\n");

// ---------------------------------------------------------------------------
// main.mjs — Electron main process. Stays thin: it only needs `electron`
// plus a small set of helpers. Workspace deps are NOT referenced here
// directly anymore (the server runs in a utility process), so we only need
// the standard set of externals.
// ---------------------------------------------------------------------------
const mainConfig = {
  entryPoints: [resolve(__dirname, "src/main.ts")],
  outfile: resolve(__dirname, "dist/main.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  external: ["electron"],
  // No CJS shim banner here: main.ts is small, only imports `electron` and
  // node:* builtins, and declares its own `__filename`/`__dirname` from
  // `import.meta.url`. Injecting the banner would cause a duplicate
  // identifier error.
  logLevel: "info",
  metafile: true,
};

// ---------------------------------------------------------------------------
// server.bundle.mjs — utility-process entry. Inlines the server graph and
// every workspace dep. Only true native modules and `electron` are external.
// ---------------------------------------------------------------------------
const serverExternal = [
  "electron",
  // Embedded Postgres ships per-arch native binaries via optional deps that
  // are loaded by `require()` at runtime. Keep the parent and every known
  // platform sub-package external so the unpacked binaries are reachable.
  "embedded-postgres",
  "@embedded-postgres/darwin-arm64",
  "@embedded-postgres/darwin-x64",
  "@embedded-postgres/linux-arm64",
  "@embedded-postgres/linux-x64",
  "@embedded-postgres/win32-x64",
  // sharp has a Node-API binding and platform-specific libvips packages.
  "sharp",
  "@img/sharp-darwin-arm64",
  "@img/sharp-darwin-x64",
  "@img/sharp-linux-arm64",
  "@img/sharp-linux-x64",
  "@img/sharp-win32-x64",
  "@img/sharp-libvips-darwin-arm64",
  "@img/sharp-libvips-darwin-x64",
  "@img/sharp-libvips-linux-arm64",
  "@img/sharp-libvips-linux-x64",
  // better-sqlite3 — present in the dep graph but not currently `import`-ed
  // from server code. Kept external defensively in case a transitive dep
  // loads it (e.g. better-auth adapters).
  "better-sqlite3",
  // Third-party SDKs that ship a single webpack-bundled JS entry alongside
  // .d.ts files referencing internal workspace packages. esbuild follows the
  // .d.ts side of the `exports` map and fails because those workspace deps
  // are not published. Keep them external and install them into
  // electron/node_modules so the runtime import works.
  "@cursor/sdk",
  "@anthropic-ai/claude-agent-sdk",
  "hermes-paperclip-adapter",
  // Optional native filesystem watcher used by chokidar on macOS. ships a
  // `.node` binding. Keep external + unpack at install time.
  "fsevents",
  // CSS toolchain native binding (used transitively by some UI tooling).
  "lightningcss",
  // jsdom and its CSS tree dependency load JSON data files via
  // `createRequire(import.meta.url)("../data/...json")`. After bundling, the
  // bundle's location is electron/dist/ so those relative paths point at the
  // wrong place. Externalize the tree and install jsdom at runtime so the
  // sibling node_modules/jsdom/... data files resolve correctly.
  "jsdom",
  "css-tree",
  "mdn-data",
  // pino + transports use worker_threads with a worker filename computed from
  // `__dirname` inside pino. When pino is bundled, that worker path resolves
  // to electron/dist/worker.js (does not exist) instead of pino/lib/worker.js.
  // Externalize the whole pino logging surface so workers boot off the real
  // filesystem at electron/node_modules/pino/...
  "pino",
  "pino-http",
  "pino-pretty",
  "pino-abstract-transport",
  "pino-std-serializers",
  "thread-stream",
  "real-require",
  // ws is required via createRequire(import.meta.url) from
  // server/realtime/live-events-ws.ts; bundling would mask the failure.
  "ws",
];

const serverConfig = {
  entryPoints: [resolve(__dirname, "src/server-entry.ts")],
  outfile: resolve(__dirname, "dist/server.bundle.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  external: serverExternal,
  // Pin esbuild to resolve via the runtime conditions only. Without this,
  // esbuild picks up `types` exports from third-party SDKs (e.g. @cursor/sdk)
  // and tries to bundle `.d.ts` files, which fails.
  conditions: ["node", "import", "default"],
  mainFields: ["module", "main"],
  resolveExtensions: [".ts", ".mjs", ".js", ".cjs"],
  banner: { js: cjsShimBanner },
  // Some deps lazy-`require()` optional native modules (e.g. pino transports,
  // jsdom canvas). Mark those as external too so bundling does not fail when
  // they're missing — they'll be resolved at runtime if installed.
  plugins: [
    {
      name: "externalize-optional-natives",
      setup(b) {
        const optional = [
          // pino transports
          /^pino-pretty$/,
          /^thread-stream$/,
          // jsdom optional canvas backend
          /^canvas$/,
          // sharp optional simd builds we don't know about at build time
          /^@img\/sharp-.*$/,
          /^@embedded-postgres\/.*$/,
        ];
        b.onResolve({ filter: /.*/ }, (args) => {
          if (optional.some((p) => p.test(args.path))) {
            return { path: args.path, external: true };
          }
          return null;
        });
      },
    },
    {
      // is-promise@4 ships dual ESM/CJS via an exports map:
      //   "import" -> ./index.mjs (export default fn)
      //   "require" -> ./index.js  (module.exports = fn)
      // Our `conditions: ["node","import","default"]` resolves this to the
      // ESM file even when the importer is bundled CJS (router@2/lib/layer.js
      // does `const isPromise = require("is-promise")`). esbuild's
      // `__toCommonJS(is_promise_exports)` then yields `{ default: fn }`
      // instead of the bare function — and the call site `isPromise3(ret)`
      // crashes with "isPromise3 is not a function" on every HTTP request.
      // Let esbuild resolve normally, then rewrite the resulting
      // .../is-promise/index.mjs to .../is-promise/index.js.
      name: "force-cjs-is-promise",
      setup(b) {
        b.onResolve({ filter: /^is-promise$/ }, async (args) => {
          if (args.pluginData?.isPromiseRewrite) return null;
          const r = await b.resolve(args.path, {
            importer: args.importer,
            kind: args.kind,
            resolveDir: args.resolveDir,
            namespace: args.namespace,
            pluginData: { isPromiseRewrite: true },
          });
          if (r.errors.length) return r;
          return { path: r.path.replace(/\/is-promise\/index\.mjs$/, "/is-promise/index.js") };
        });
      },
    },
  ],
  logLevel: "info",
  metafile: true,
};

/**
 * Static assets the main process loads at runtime from `dist/` via __dirname:
 *   - welcome.html         — first-run modal markup
 *   - welcome-renderer.js  — small in-page script wired by welcome.html
 *   - welcome-preload.cjs  — contextBridge preload for the modal
 *
 * Kept as plain copies (not bundled) so the markup and renderer stay
 * human-editable and electron-builder ships them via `dist/**\/*`.
 */
const WELCOME_ASSETS = ["welcome.html", "welcome-renderer.js", "welcome-preload.cjs"];

function copyWelcomeAssets() {
  const srcDir = resolve(__dirname, "src");
  const outDir = resolve(__dirname, "dist");
  mkdirSync(outDir, { recursive: true });
  for (const name of WELCOME_ASSETS) {
    copyFileSync(resolve(srcDir, name), resolve(outDir, name));
  }
}

async function runOnce() {
  await Promise.all([build(mainConfig), build(serverConfig)]);
  copyWelcomeAssets();
  // eslint-disable-next-line no-console
  console.log(
    `[electron] built ${pkg.name}@${pkg.version} -> dist/main.mjs + dist/server.bundle.mjs + welcome assets`,
  );
}

async function runWatch() {
  const [mainCtx, serverCtx] = await Promise.all([
    context(mainConfig),
    context(serverConfig),
  ]);
  await Promise.all([mainCtx.watch(), serverCtx.watch()]);
  // Watch mode does not re-copy static assets on every change — copy once at
  // start so the dist tree is complete for `electron dist/main.mjs`.
  copyWelcomeAssets();
  // eslint-disable-next-line no-console
  console.log(
    `[electron] watching ${pkg.name}@${pkg.version} (main + server bundles)`,
  );
}

if (watch) {
  await runWatch();
} else {
  await runOnce();
}
