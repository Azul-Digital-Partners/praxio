/**
 * Praxio Electron main process.
 *
 * Boots the Praxio server in-process, waits for it to listen on a port, then
 * opens a single BrowserWindow pointed at the server's local URL.
 *
 * Lifecycle:
 *   - Single-instance lock: a second launch focuses the existing window.
 *   - macOS: app stays alive when last window closes; reactivation opens window.
 *   - All platforms: server is shut down on app quit.
 */

import { app, BrowserWindow, shell, Menu } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import type { StartedServer } from "@paperclipai/server";

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

// Point Paperclip at the per-user data dir before importing/running the server.
// `loadConfig` reads PAPERCLIP_HOME to derive embedded-postgres dir, secrets dir,
// and on-disk state. Using userData keeps each install isolated and survives upgrades.
process.env.PAPERCLIP_HOME ??= userDataDir;
// In a packaged app we never want to prompt for migrations — auto-apply.
process.env.PAPERCLIP_MIGRATION_AUTO_APPLY ??= "true";
process.env.PAPERCLIP_MIGRATION_PROMPT ??= "never";

let mainWindow: BrowserWindow | null = null;
let started: StartedServer | null = null;
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

async function bootServer(): Promise<StartedServer> {
  logInfo("starting embedded server (PAPERCLIP_HOME=", process.env.PAPERCLIP_HOME, ")");
  // Dynamic import so we can set env vars above first.
  const { startServer } = await import("@paperclipai/server");
  const s = await startServer();
  logInfo("server listening", { host: s.host, port: s.listenPort, apiUrl: s.apiUrl });
  return s;
}

function createWindow(serverUrl: string): BrowserWindow {
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const local = serverUrl.replace(/\/$/, "");
      if (!url.startsWith(local)) {
        void shell.openExternal(url);
        return { action: "deny" };
      }
    }
    return { action: "allow" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const local = serverUrl.replace(/\/$/, "");
    if (!url.startsWith(local)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  void win.loadURL(serverUrl);
  return win;
}

async function ensureWindow(): Promise<void> {
  if (!started) {
    started = await bootServer();
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow(started.apiUrl);
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
  if (!started) return;
  if (isQuitting && started.server.listening) {
    event.preventDefault();
    try {
      started.server.close(() => {
        started = null;
        app.exit(0);
      });
      // Hard timeout — don't hang forever.
      setTimeout(() => {
        app.exit(0);
      }, 5_000).unref();
    } catch (err) {
      logError("error closing server on quit", err);
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
    // Show a minimal error to the user via a blank window load failure.
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

// Silence eslint about unused __dirname in some configurations.
void __dirname;
