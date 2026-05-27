import { createRequire } from "node:module";

type PackageJson = {
  version?: string;
};

// When this module is loaded directly from server/dist (or via `tsx` in dev),
// `../package.json` is the server package's manifest. When the server is
// bundled into electron/dist/server.bundle.mjs for the packaged desktop app,
// no package.json is adjacent and the require throws ERR_MODULE_NOT_FOUND.
// Fall back to a placeholder version in that case so the server still boots.
function readServerVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as PackageJson;
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const serverVersion = readServerVersion();
