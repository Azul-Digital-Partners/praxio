/**
 * Welcome modal renderer-side script.
 *
 * Reads the telemetry checkbox state and hands the result back to the main
 * process via `window.praxio.completeWelcome` (exposed by welcome-preload.cjs).
 *
 * Kept intentionally small and dependency-free: the welcome window CSP only
 * allows local `script-src 'self'`, so no inline handlers and no third-party
 * scripts.
 */
"use strict";

(function () {
  var telemetryEl = document.getElementById("telemetry");
  var continueEl = document.getElementById("continue");
  if (!telemetryEl || !continueEl) return;

  continueEl.addEventListener("click", function () {
    continueEl.disabled = true;
    var telemetryEnabled = !!telemetryEl.checked;
    var api = window.praxio || {};
    if (typeof api.completeWelcome === "function") {
      api.completeWelcome({ telemetryEnabled: telemetryEnabled });
    }
  });
})();
