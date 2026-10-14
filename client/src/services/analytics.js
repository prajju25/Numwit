/**
 * analytics.js — privacy-friendly product analytics (Umami Cloud).
 * ─────────────────────────────────────────────────────────────────────────────
 * Cookieless, no personal data, no consent banner needed. Page views are
 * tracked automatically by the Umami script (including SPA route changes);
 * funnel steps are custom events sent with track().
 *
 * Inactive unless both hold:
 *   - a website id was provided at build time (UMAMI_WEBSITE_ID, see
 *     fly.toml [build.args] and docs/FLY_DEPLOYMENT.md), and
 *   - the page is served from the production host,
 * so local dev, previews and numwit.fly.dev never pollute the numbers.
 *
 * Funnel events (keep names stable — dashboards/reports depend on them):
 *   play_click → profile_done → room_join → first_pick → game_finished
 *   → share_card_open / share / invite
 *   plus install_click, app_installed.
 * "Came back within 7 days" is measured server-side from real games
 * (admin dashboard → Growth → Returning from last week).
 */

export const PROD_HOST = "numwit.prajvex.com";
export const UMAMI_SCRIPT = "https://cloud.umami.is/script.js";

const WEBSITE_ID = process.env.UMAMI_WEBSITE_ID || "";

/** Injects the Umami script when configured for this host. Returns true if active. */
export function initAnalytics(websiteId = WEBSITE_ID, host = window.location.hostname) {
  if (!websiteId || host !== PROD_HOST) return false;
  if (document.querySelector(`script[src="${UMAMI_SCRIPT}"]`)) return true;

  const script = document.createElement("script");
  script.defer = true;
  script.src = UMAMI_SCRIPT;
  script.setAttribute("data-website-id", websiteId);
  script.setAttribute("data-domains", PROD_HOST);
  document.head.appendChild(script);
  return true;
}

/** Fire-and-forget custom event. Never throws, no-op when analytics is off. */
export function track(name, data) {
  try {
    if (typeof window !== "undefined" && window.umami && typeof window.umami.track === "function") {
      if (data) window.umami.track(name, data);
      else window.umami.track(name);
    }
  } catch (_) {
    // analytics must never break the game
  }
}
