/**
 * Praxio server utility-process entry.
 *
 * This module is bundled by esbuild into `electron/dist/server.bundle.mjs` and
 * launched by `main.ts` via `utilityProcess.fork`. It boots the embedded
 * Paperclip server, then posts the resolved listen URL back to the Electron
 * main process via `process.parentPort`. Errors are reported the same way so
 * the main process can surface them to the user instead of hanging.
 *
 * Path overrides for packaged-app resources (UI dist, DB migrations) are
 * forwarded as env vars by `main.ts` before fork, so this entry only needs to
 * import and start the server.
 */

import { startServer } from "@paperclipai/server";

// The utility-process global. Typed loosely because `process.parentPort` is
// only present in Electron utility processes; @types/node doesn't model it.
const parentPort: {
  postMessage(message: unknown): void;
  on(event: "message", listener: (msg: { data: unknown }) => void): void;
} | undefined = (process as unknown as { parentPort?: typeof parentPort }).parentPort;

function postSafe(message: unknown): void {
  try {
    parentPort?.postMessage(message);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[server-entry] failed to postMessage to parent", err);
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    "[server-entry] booting (PAPERCLIP_HOME=",
    process.env.PAPERCLIP_HOME,
    ", PAPERCLIP_UI_DIST=",
    process.env.PAPERCLIP_UI_DIST,
    ", PAPERCLIP_DB_MIGRATIONS_DIR=",
    process.env.PAPERCLIP_DB_MIGRATIONS_DIR,
    ")",
  );
  const started = await startServer();
  // eslint-disable-next-line no-console
  console.log(
    "[server-entry] server listening",
    JSON.stringify({ host: started.host, port: started.listenPort, apiUrl: started.apiUrl }),
  );
  postSafe({
    type: "started",
    apiUrl: started.apiUrl,
    host: started.host,
    listenPort: started.listenPort,
  });
}

parentPort?.on("message", (msg) => {
  // Allow the main process to request a graceful shutdown by posting
  // `{ type: "shutdown" }`. We just exit cleanly — node-http's `server.close`
  // is invoked by `before-exit` listeners inside the server.
  const data = msg?.data as { type?: string } | undefined;
  if (data?.type === "shutdown") {
    // eslint-disable-next-line no-console
    console.log("[server-entry] shutdown requested by parent");
    process.exit(0);
  }
});

process.on("uncaughtException", (err) => {
  // eslint-disable-next-line no-console
  console.error("[server-entry] uncaughtException", err);
  postSafe({
    type: "error",
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
});
process.on("unhandledRejection", (err) => {
  // eslint-disable-next-line no-console
  console.error("[server-entry] unhandledRejection", err);
  postSafe({
    type: "error",
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
});

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[server-entry] startup failed", err);
  postSafe({
    type: "error",
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  // Give parentPort a tick to flush, then exit.
  setTimeout(() => process.exit(1), 100);
});
