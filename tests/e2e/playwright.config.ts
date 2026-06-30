import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Use a dedicated port so e2e tests always start their own server in local_trusted mode,
// even when the dev server is running on :3100 in authenticated mode.
const PORT = Number(process.env.PAPERCLIP_E2E_PORT ?? 3199);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PAPERCLIP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-e2e-home-"));

// AZU-2958: in CI the Playwright runner executes as root inside the
// `mcr.microsoft.com/playwright` container, but embedded-postgres refuses to
// boot as uid 0. When PAPERCLIP_E2E_WEBSERVER_USER is set (typically `pwuser`
// in CI), transfer ownership of PAPERCLIP_HOME to that user and wrap the
// webServer command with `su -p` so only the paperclipai subprocess drops
// privileges. HOME is pinned to PAPERCLIP_HOME inside the dropped shell so
// embedded-postgres caches binaries inside the throwaway dir rather than
// the inherited /root. With the env unset (local dev), the command is
// unchanged.
//
// PAM on jammy strips PATH from `su` even with --preserve-environment
// (ENV_PATH from /etc/login.defs wins), so explicitly carry PATH and
// PNPM_HOME from the outer process into the inner shell — otherwise
// `pnpm` is not on PATH for the dropped user. Mirrors the fix taken in
// the AZU-2956 sibling workflow path.
const RAW_WEBSERVER_COMMAND = `pnpm paperclipai onboard --yes --run`;
const WEBSERVER_DROP_USER = process.env.PAPERCLIP_E2E_WEBSERVER_USER?.trim();
const OUTER_PATH = process.env.PATH ?? "";
const OUTER_PNPM_HOME = process.env.PNPM_HOME ?? "";
const WEBSERVER_COMMAND = WEBSERVER_DROP_USER
  ? `chown -R ${WEBSERVER_DROP_USER} ${JSON.stringify(PAPERCLIP_HOME)} && exec su -p -s /bin/bash ${WEBSERVER_DROP_USER} -c ${JSON.stringify(
      `export PATH=${JSON.stringify(OUTER_PATH)}; export PNPM_HOME=${JSON.stringify(OUTER_PNPM_HOME)}; HOME=${JSON.stringify(PAPERCLIP_HOME)} ${RAW_WEBSERVER_COMMAND}`,
    )}`
  : RAW_WEBSERVER_COMMAND;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  // These suites target dedicated multi-user configurations/ports and are
  // intentionally not part of the default local_trusted e2e run.
  testIgnore: ["multi-user.spec.ts", "multi-user-authenticated.spec.ts"],
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  // The webServer directive bootstraps a throwaway instance and then starts it.
  // `onboard --yes --run` works in a non-interactive temp PAPERCLIP_HOME.
  webServer: {
    command: WEBSERVER_COMMAND,
    url: `${BASE_URL}/api/health`,
    // Always boot a dedicated throwaway instance for e2e so browser tests
    // never attach to the developer's active Paperclip home/server.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PORT: String(PORT),
      PAPERCLIP_HOME,
      PAPERCLIP_INSTANCE_ID: "playwright-e2e",
      PAPERCLIP_BIND: "loopback",
      PAPERCLIP_DEPLOYMENT_MODE: "local_trusted",
      PAPERCLIP_DEPLOYMENT_EXPOSURE: "private",
    },
  },
  outputDir: "./test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "./playwright-report" }]],
});
