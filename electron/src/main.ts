/**
 * Praxio Electron main process.
 *
 * Forks the Praxio server in a Node-compatible utility process, waits for it
 * to report a listen URL over its parent port, then opens a single
 * BrowserWindow pointed at that URL.
 *
 * Lifecycle:
 *   - Single-instance lock: a second launch focuses the existing window.
 *   - macOS: app stays alive when last window closes; reactivation opens window.
 *   - All platforms: server utility process is terminated on app quit.
 *
 * Why a utility process and not an in-main `import @paperclipai/server`?
 *   1. The embedded server pulls in ~190 transitive deps and an embedded-postgres
 *      cold start that would block the main thread before the BrowserWindow
 *      can paint. Running it out-of-process keeps the UI responsive.
 *   2. A crash in the server process no longer takes down the Electron
 *      renderer / main process.
 *   3. The packaged app does not need a working pnpm workspace symlink graph
 *      inside `app.asar` — the server is shipped as a single pre-bundled
 *      `server.bundle.mjs` that inlines its workspace deps.
 */

import { app, BrowserWindow, shell, Menu, utilityProcess } from "electron";
import type { UtilityProcess } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, createWriteStream } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Single-instance lock — a second launch should just focus the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// Configure userData directory before Electron initializes anything that reads it.
// This must happen before `ready` and before any Paperclip config is loaded.
const userDataDir = (() => {
  // Resolves to:
  //   macOS: ~/Library/Application Support/Praxio
  //   linux: ~/.config/Praxio
  //   win32: %APPDATA%/Praxio
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  return dir;
})();

// Per-user log directory. macOS convention is ~/Library/Logs/<AppName>.
// Electron's `getPath("logs")` returns that on macOS and a sensible default
// on Linux/Windows. We pipe the utility-process stdio there so users (and
// support) can read server logs without rebuilding.
const logsDir = (() => {
  const dir = app.getPath("logs");
  mkdirSync(dir, { recursive: true });
  return dir;
})();
const serverLogPath = join(logsDir, "server.log");

// Point Paperclip at the per-user data dir before forking the server.
// `loadConfig` reads PAPERCLIP_HOME to derive embedded-postgres dir, secrets
// dir, and on-disk state. Using userData keeps each install isolated and
// survives upgrades.
process.env.PAPERCLIP_HOME ??= userDataDir;
// In a packaged app we never want to prompt for migrations — auto-apply.
process.env.PAPERCLIP_MIGRATION_AUTO_APPLY ??= "true";
process.env.PAPERCLIP_MIGRATION_PROMPT ??= "never";

// Resources that ship in the packaged .app's Resources/app/* tree. In dev
// (electron started against `electron/dist/main.mjs`) these point at the repo
// source so the same code path works for `pnpm run dev`.
const resourcesRoot = process.resourcesPath ?? join(__dirname, "..", "..");
const packagedUiDist = join(resourcesRoot, "app", "server", "ui-dist");
const packagedMigrationsDir = join(resourcesRoot, "app", "packages", "db", "migrations");

// Only set the override if it isn't already specified by the user — this lets
// developers point at a different UI build via env without rebuilding.
process.env.PAPERCLIP_UI_DIST ??= packagedUiDist;
process.env.PAPERCLIP_DB_MIGRATIONS_DIR ??= packagedMigrationsDir;

let mainWindow: BrowserWindow | null = null;
let serverChild: UtilityProcess | null = null;
let serverUrl: string | null = null;
// Cached bootServer() promise — if `app.whenReady` and `app.on("activate")`
// fire back-to-back (which they do on cold launch on macOS), both call
// `ensureWindow()` before `serverUrl` is set. Without this guard we end up
// forking two utility processes that race on embedded-postgres init, leaving
// the cluster half-initialized and the lock file from one process blocking
// the other.
let serverBootPromise: Promise<string> | null = null;
let isQuitting = false;

function logInfo(...args: unknown[]): void {
  // Electron pipes stdout to its log files; keep this simple.
  // eslint-disable-next-line no-console
  console.log("[praxio]", ...args);
}

function logError(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.error("[praxio]", ...args);
}

interface ServerStartedMessage {
  type: "started";
  apiUrl: string;
  host: string;
  listenPort: number;
}

interface ServerErrorMessage {
  type: "error";
  message: string;
  stack?: string;
}

type ServerMessage = ServerStartedMessage | ServerErrorMessage;

async function bootServer(): Promise<string> {
  // The server bundle does `import("@embedded-postgres/<arch>")` (ESM dynamic
  // import). Node's ESM resolver picks the resolution context from the
  // importing file's *literal* on-disk path. Inside a packaged Electron app,
  // the bundle lives at `Resources/app.asar/dist/server.bundle.mjs`. asarUnpack
  // copies the per-arch native packages into `app.asar.unpacked/node_modules/`,
  // but ESM resolution never crosses from `app.asar` into `app.asar.unpacked`.
  // Forking the bundle directly from its unpacked twin keeps the entire
  // resolution chain on the real filesystem.
  const asarBundle = join(__dirname, "server.bundle.mjs");
  const serverBundle = asarBundle.includes("/app.asar/")
    ? asarBundle.replace("/app.asar/", "/app.asar.unpacked/")
    : asarBundle;
  logInfo("forking server utility process", {
    bundle: serverBundle,
    PAPERCLIP_HOME: process.env.PAPERCLIP_HOME,
    PAPERCLIP_UI_DIST: process.env.PAPERCLIP_UI_DIST,
    PAPERCLIP_DB_MIGRATIONS_DIR: process.env.PAPERCLIP_DB_MIGRATIONS_DIR,
    logFile: serverLogPath,
  });

  const child = utilityProcess.fork(serverBundle, [], {
    serviceName: "praxio-server",
    // Inherit env (PAPERCLIP_*, PATH, HOME, etc.) — utilityProcess defaults
    // to inheriting the parent env, but we re-pass it explicitly to make
    // the contract obvious for future maintainers.
    env: { ...process.env },
    // Pipe stdio so we can capture it into the rolling log file.
    stdio: "pipe",
  });

  // Append (not truncate) so a single user session keeps history across
  // a relaunch within a tight loop. Caller is responsible for rotation.
  const logStream = createWriteStream(serverLogPath, { flags: "a" });
  logStream.write(`\n--- server start ${new Date().toISOString()} ---\n`);
  child.stdout?.pipe(logStream, { end: false });
  child.stderr?.pipe(logStream, { end: false });

  return await new Promise<string>((resolve, reject) => {
    const startupTimeout = setTimeout(() => {
      reject(new Error("server did not report listening within 60s"));
    }, 60_000);

    child.on("message", (raw) => {
      const msg = raw as ServerMessage;
      if (msg?.type === "started") {
        clearTimeout(startupTimeout);
        logInfo("server reported listening", {
          host: msg.host,
          port: msg.listenPort,
          apiUrl: msg.apiUrl,
        });
        serverUrl = msg.apiUrl;
        resolve(msg.apiUrl);
        return;
      }
      if (msg?.type === "error") {
        clearTimeout(startupTimeout);
        logError("server reported error", msg.message, msg.stack);
        reject(new Error(`server start failed: ${msg.message}`));
        return;
      }
    });

    child.on("exit", (code) => {
      clearTimeout(startupTimeout);
      logError("server process exited", { code });
      if (!serverUrl) {
        reject(new Error(`server exited before listening (code=${code})`));
      }
      serverChild = null;
    });

    serverChild = child;
  });
}

function createWindow(url: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b0f17",
    title: "Praxio",
    autoHideMenuBar: process.platform !== "darwin",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // No preload yet — Praxio UI talks to the local server over HTTP/WS.
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  // Open external links in the user's default browser instead of in-app.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("http://") || target.startsWith("https://")) {
      const local = url.replace(/\/$/, "");
      if (!target.startsWith(local)) {
        void shell.openExternal(target);
        return { action: "deny" };
      }
    }
    return { action: "allow" };
  });

  win.webContents.on("will-navigate", (event, target) => {
    const local = url.replace(/\/$/, "");
    if (!target.startsWith(local)) {
      event.preventDefault();
      void shell.openExternal(target);
    }
  });

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  void win.loadURL(url);
  return win;
}

async function ensureWindow(): Promise<void> {
  if (!serverUrl) {
    serverBootPromise ??= bootServer();
    serverUrl = await serverBootPromise;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow(serverUrl);
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

app.on("second-instance", () => {
  // Someone tried to launch a second copy — focus our window instead.
  void ensureWindow();
});

app.on("window-all-closed", () => {
  // On macOS, apps typically stay running until the user explicitly quits.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // macOS — clicking the dock icon when no windows are open should reopen one.
  void ensureWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", (event) => {
  if (!serverChild) return;
  if (isQuitting) {
    event.preventDefault();
    try {
      // Ask politely first, fall back to kill, then exit.
      serverChild.postMessage({ type: "shutdown" });
      const child = serverChild;
      const hardTimer = setTimeout(() => {
        try {
          child.kill();
        } catch (err) {
          logError("error killing server on quit", err);
        }
        app.exit(0);
      }, 5_000);
      hardTimer.unref();
      child.once("exit", () => {
        clearTimeout(hardTimer);
        serverChild = null;
        app.exit(0);
      });
    } catch (err) {
      logError("error stopping server on quit", err);
      app.exit(0);
    }
  }
});

void app.whenReady().then(async () => {
  // On macOS we hide the default menu chrome but still keep the system menu.
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }
  try {
    await ensureWindow();
  } catch (err) {
    logError("failed to boot Praxio server", err);
    // Future: render a static error page bundled with the app.
    app.exit(1);
  }
});

// Best-effort cleanup if the main process crashes.
process.on("uncaughtException", (err) => {
  logError("uncaughtException", err);
});
process.on("unhandledRejection", (err) => {
  logError("unhandledRejection", err);
});
