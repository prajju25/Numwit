/**
 * errorReporting.js — make client-side failures visible.
 * ─────────────────────────────────────────────────────────────────────────────
 * A player's browser console is invisible to us, so a failure is logged to the
 * console AND sent to Umami as a "client_error" event ({ where, message }),
 * where it shows up under Events next to the funnel.
 *
 * Privacy and noise: only a short message (no stack, no URL, no user data),
 * each distinct message once per page load, and at most a few per load.
 */
import { track } from "./analytics";

const MAX_PER_LOAD = 5;
const MAX_MESSAGE = 120;

let sent = new Set();

function messageOf(error) {
  if (!error) return "unknown";
  if (typeof error === "string") return error;
  return error.message || String(error);
}

/**
 * Log a failure and report it once. `where` is a short label for the place
 * it happened ("render", "window", "share_card", …).
 */
export function reportError(where, error) {
  const message = messageOf(error).slice(0, MAX_MESSAGE);
  console.error(`[${where}]`, error);
  const key = `${where}:${message}`;
  if (sent.has(key) || sent.size >= MAX_PER_LOAD) return;
  sent.add(key);
  track("client_error", { where, message });
}

/** Report errors that nothing else caught (runtime errors, rejected promises). */
export function initErrorReporting(target = window) {
  target.addEventListener("error", (event) => {
    // Resource load errors (a missing image) have no .error — skip those
    if (event && event.error) reportError("window", event.error);
  });
  target.addEventListener("unhandledrejection", (event) => {
    reportError("promise", event && event.reason);
  });
}

/** Test helper: forget what was already reported. */
export function resetErrorReporting() {
  sent = new Set();
}
