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

import { app, BrowserWindow, shell, Menu, utilityProcess, ipcMain } from "electron";
import type { UtilityProcess } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  mkdirSync,
  createWriteStream,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Single-instance lock — a second launch should just focus the existing window.
// Combined with the `second-instance` handler below, this guarantees we never
// fork a duplicate utility-process server, which would race on the embedded
// postgres lock file and leave a half-initialized cluster behind.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// Register `praxio://` as the default URL scheme for this app so links like
// `praxio://open` focus the running window (handled in the `open-url` and
// `second-instance` listeners below). Must be called before `app.whenReady`.
// On packaged macOS builds Electron uses the embedded Info.plist URL types
// declaration; calling this at runtime registers the LaunchServices entry on
// first launch and is a no-op afterwards.
if (process.defaultApp) {
  // Dev mode: argv is `electron dist/main.mjs`, so we pass the script path.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("praxio", process.execPath, [
      join(process.argv[1]!),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("praxio");
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

// On-disk state files inside userData. Kept as flat JSON instead of a single
// preferences blob so each subsystem (first-run, telemetry, future) owns its
// own file and we can evolve schemas independently.
const firstRunStatePath = join(userDataDir, "first-run.json");
const telemetryStatePath = join(userDataDir, "telemetry.json");

interface FirstRunState {
  completedAt: string | null;
  // Recorded so we can later distinguish "user dismissed at vX" from "fresh
  // install on vX" if a future release wants to re-show a what's-new modal.
  completedVersion: string | null;
}

interface TelemetryState {
  enabled: boolean;
  // Wall-clock timestamp of the user's choice. The recorded copy of the
  // welcome modal will live in this file too once we add ToS / privacy
  // versioning; for Phase B we only persist the bare consent.
  decidedAt: string | null;
  // Phase B does not transmit anything. Keep a marker so a future Phase C
  // transmitter can prove the consent flow was actually exercised on disk
  // instead of inferred from default-off.
  consentVersion: 1;
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (err) {
    logError("failed to read JSON state", path, err);
    return null;
  }
}

function writeJsonFile(path: string, value: unknown): void {
  try {
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
  } catch (err) {
    logError("failed to write JSON state", path, err);
  }
}

function isFirstRun(): boolean {
  const state = readJsonFile<FirstRunState>(firstRunStatePath);
  return !state || !state.completedAt;
}

function recordFirstRunComplete(): void {
  const state: FirstRunState = {
    completedAt: new Date().toISOString(),
    completedVersion: app.getVersion(),
  };
  writeJsonFile(firstRunStatePath, state);
}

function recordTelemetryChoice(enabled: boolean): void {
  const state: TelemetryState = {
    enabled,
    decidedAt: new Date().toISOString(),
    consentVersion: 1,
  };
  writeJsonFile(telemetryStatePath, state);
}

let mainWindow: BrowserWindow | null = null;
let welcomeWindow: BrowserWindow | null = null;
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

/**
 * Create + show the first-run welcome modal. Returns the window so the caller
 * can await its `closed` event if it needs to block on user action.
 *
 * The window is fixed-size and non-resizable on purpose — the modal copy is
 * tuned for one screen, and a resizable welcome panel would make the cancel /
 * dismiss affordance ambiguous. CSP is locked down inside `welcome.html`.
 */
function showWelcomeWindow(): BrowserWindow {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.focus();
    return welcomeWindow;
  }
  const htmlPath = join(__dirname, "welcome.html");
  const preloadPath = join(__dirname, "welcome-preload.cjs");
  const win = new BrowserWindow({
    width: 600,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#0b0f17",
    title: "Welcome to Praxio",
    autoHideMenuBar: process.platform !== "darwin",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  });
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });
  win.on("closed", () => {
    if (welcomeWindow === win) {
      welcomeWindow = null;
    }
  });
  // Welcome window only ever loads our bundled local file. Block any
  // navigation away from it.
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  void win.loadFile(htmlPath);
  welcomeWindow = win;
  return win;
}

/**
 * Build the macOS application menu (About / Preferences / Hide / Quit). On
 * Linux + Windows we leave the default minimal chrome alone — the standard
 * window-frame Close/Minimize buttons are sufficient for Phase B.
 *
 * "Preferences…" is a placeholder per Phase B scope — it currently re-opens
 * the welcome modal so users can revisit the telemetry choice without us
 * shipping a full Settings panel (deferred to a future phase).
 */
function buildAppMenu(): void {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Praxio",
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Preferences…",
          accelerator: "Cmd+,",
          click: () => {
            showWelcomeWindow();
          },
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      role: "windowMenu",
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * React to a `praxio://...` URL handed to us by either a `second-instance`
 * launch (Windows / Linux) or `open-url` (macOS).
 *
 * Phase B scope is intentionally narrow: any praxio:// URL just focuses the
 * window. Deeper deep-link routing (per the parent plan) is a product-roadmap
 * concern, not packaging.
 */
function handlePraxioUrl(url: string): void {
  logInfo("praxio:// URL received", url);
  void ensureWindow();
}

function extractPraxioUrl(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (typeof arg === "string" && arg.startsWith("praxio://")) {
      return arg;
    }
  }
  return null;
}

app.on("second-instance", (_event, argv) => {
  // Someone tried to launch a second copy — focus our window instead. The
  // single-instance lock above already prevented the duplicate Electron
  // process from continuing past startup, so by the time we get here we know
  // we are the surviving primary and just need to surface the window.
  const url = extractPraxioUrl(argv);
  if (url) {
    handlePraxioUrl(url);
  } else {
    void ensureWindow();
  }
});

// macOS: deep links arrive via `open-url` instead of being appended to argv.
// Register the listener at module scope so a launch-from-link wakeup before
// `app.whenReady` is still captured (Electron buffers these until ready).
app.on("open-url", (event, url) => {
  event.preventDefault();
  handlePraxioUrl(url);
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
  if (!isQuitting) return;

  // Three-stage quit:
  //   t=0    graceful — postMessage({type:"shutdown"}) so the server can
  //          stop embedded postgres via its own async-exit-hook chain.
  //   t=5s   SIGTERM via utilityProcess.kill() if the server hasn't exited.
  //   t=6s   SIGKILL via process.kill(pid,"SIGKILL") as the no-orphan
  //          backstop. Without this we observed lingering postgres workers
  //          when the server got wedged mid-startup (the SIGTERM never
  //          reached the child postgres tree).
  //
  // The "no ghost postgres processes" line in the acceptance criteria is
  // why stage 3 exists. Stage 2 is the polite intermediate.
  event.preventDefault();
  const child = serverChild;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    serverChild = null;
    app.exit(0);
  };

  try {
    child.postMessage({ type: "shutdown" });
  } catch (err) {
    logError("error posting shutdown to server", err);
  }

  const sigtermTimer = setTimeout(() => {
    try {
      logError("server did not exit within 5s of shutdown, sending SIGTERM");
      child.kill();
    } catch (err) {
      logError("error sending SIGTERM to server", err);
    }
  }, 5_000);
  sigtermTimer.unref();

  const sigkillTimer = setTimeout(() => {
    const pid = (child as unknown as { pid?: number }).pid;
    if (typeof pid === "number") {
      try {
        logError("server did not exit within 6s, sending SIGKILL", { pid });
        process.kill(pid, "SIGKILL");
      } catch (err) {
        logError("error sending SIGKILL to server", err);
      }
    }
    finish();
  }, 6_000);
  sigkillTimer.unref();

  child.once("exit", () => {
    clearTimeout(sigtermTimer);
    clearTimeout(sigkillTimer);
    finish();
  });
});

// IPC: the welcome modal's "Get started" button reaches here via the
// `welcome-preload.cjs` contextBridge. We persist the consent choice, record
// the first-run completion, close the modal, and then open the main window.
ipcMain.on("praxio:welcome:complete", (event, payload: unknown) => {
  const telemetryEnabled = !!(
    payload &&
    typeof payload === "object" &&
    "telemetryEnabled" in payload &&
    (payload as { telemetryEnabled?: unknown }).telemetryEnabled
  );
  logInfo("welcome modal completed", { telemetryEnabled });
  recordTelemetryChoice(telemetryEnabled);
  // recordFirstRunComplete is idempotent — if the user opened the modal via
  // Preferences after first run we still rewrite the timestamp, which is
  // harmless and gives us a "last revisited" signal for free.
  recordFirstRunComplete();
  const sender = BrowserWindow.fromWebContents(event.sender);
  if (sender && !sender.isDestroyed()) {
    sender.close();
  }
  void ensureWindow();
});

void app.whenReady().then(async () => {
  buildAppMenu();
  try {
    if (isFirstRun()) {
      // Show the welcome modal first and let the IPC handler trigger the
      // server boot + main window. Starting the server in parallel here is
      // tempting but doubles the chance the embedded postgres init blows up
      // before we've even rendered the modal, and the welcome flow needs to
      // feel snappy in the first paint.
      showWelcomeWindow();
    } else {
      await ensureWindow();
    }
  } catch (err) {
    logError("failed to boot Praxio", err);
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
