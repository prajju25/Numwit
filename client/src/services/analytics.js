/**
 * analytics.js — privacy-friendly product analytics (Umami Cloud).
 * ─────────────────────────────────────────────────────────────────────────────
 * Cookieless, no personal data, no consent banner needed.
 *
 * Page views: the whole game lives on one URL, so Umami's automatic page
 * tracking would count a 20-minute game as a one-page "bounce". It is turned
 * off; screens report themselves with trackView() as virtual pages instead:
 *   /                home (landing)         /play/waiting   waiting room
 *   /leaderboard     leaderboard            /play/game      in a game
 *   /play/choose     room picker            /play/results   game over
 *   /play/invite     profile form from an invite link
 * (an invite link's real URL is /<room code> — never sent, so room codes
 * don't end up in the stats).
 *
 * Funnel steps are custom events sent with track() — keep names stable,
 * dashboards depend on them:
 *   play_click → profile_done → room_join → first_pick → game_finished
 *   → share_card_open / share / invite
 *   plus install_click, app_installed, and start_now (skipped the public-room
 *   countdown; { withBots, players }).
 * "Came back within 7 days" is measured server-side from real games
 * (admin dashboard → Growth → Returning from last week).
 *
 * Inactive unless both hold:
 *   - a website id was provided at build time (UMAMI_WEBSITE_ID, see
 *     fly.toml [build.args] and docs/FLY_DEPLOYMENT.md), and
 *   - the page is served from the production host,
 * so local dev, previews and numwit.fly.dev never pollute the numbers.
 * Calls made before the Umami script has loaded are queued, not lost.
 */

export const PROD_HOST = "numwit.prajvex.com";
export const UMAMI_SCRIPT = "https://cloud.umami.is/script.js";

const WEBSITE_ID = process.env.UMAMI_WEBSITE_ID || "";
const QUEUE_LIMIT = 50;

let active = false;
let queue = [];
let lastView = null;

const umamiReady = () =>
  typeof window !== "undefined" && window.umami && typeof window.umami.track === "function";

/** Run fn(umami) now, or once the script has loaded. Never throws. */
function send(fn) {
  if (umamiReady()) {
    try { fn(window.umami); } catch (_) { /* analytics must never break the game */ }
  } else if (active && queue.length < QUEUE_LIMIT) {
    queue.push(fn);
  }
}

function flush() {
  const pending = queue;
  queue = [];
  pending.forEach(send);
}

/** Injects the Umami script when configured for this host. Returns true if active. */
export function initAnalytics(websiteId = WEBSITE_ID, host = window.location.hostname) {
  if (!websiteId || host !== PROD_HOST) return false;
  active = true;
  if (document.querySelector(`script[src="${UMAMI_SCRIPT}"]`)) return true;

  const script = document.createElement("script");
  script.defer = true;
  script.src = UMAMI_SCRIPT;
  script.setAttribute("data-website-id", websiteId);
  script.setAttribute("data-domains", PROD_HOST);
  script.setAttribute("data-auto-track", "false"); // screens send trackView()
  script.addEventListener("load", flush);
  document.head.appendChild(script);
  return true;
}

/** Fire-and-forget custom event. No-op when analytics is off. */
export function track(name, data) {
  send((umami) => (data ? umami.track(name, data) : umami.track(name)));
}

/**
 * Record a virtual page view for the current screen. Repeats of the same
 * screen are ignored, so it is safe to call from effects.
 */
export function trackView(path, title) {
  if (path === lastView) return;
  lastView = path;
  send((umami) => umami.track((props) => ({ ...props, url: path, title: title || props.title })));
}

/** Test helper: forget queued calls and the last screen. */
export function resetAnalytics() {
  active = false;
  queue = [];
  lastView = null;
}
