/**
 * Preload script for the first-run welcome window.
 *
 * Bridges the sandboxed renderer to a single IPC channel
 * (`praxio:welcome:complete`) that delivers the telemetry-consent choice back
 * to the main process. No other surface area is exposed.
 *
 * Sandbox is ON for this window — only `ipcRenderer` and `contextBridge` are
 * accessible to preload scripts in that mode, which is exactly what we need.
 */
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("praxio", {
  /**
   * Notify the main process that the user finished the welcome flow.
   * @param {{ telemetryEnabled: boolean }} payload
   */
  completeWelcome: (payload) => {
    const telemetryEnabled = !!(payload && payload.telemetryEnabled);
    ipcRenderer.send("praxio:welcome:complete", { telemetryEnabled });
  },
});
