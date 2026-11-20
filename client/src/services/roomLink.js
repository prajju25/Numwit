/**
 * roomLink.js — what kind of page a URL path is.
 *
 * The game has three real addresses: "/" (home), "/leaderboard" and
 * "/<room code>" (a private-room invite). Room codes are 6 lowercase letters
 * or digits (server/socketHandlers/lobby.js). Anything else (crawlers try
 * /contact, /careers, …) is "unknown": it shows the home page and isn't
 * counted in analytics.
 */
const ROOM_CODE = /^[0-9a-z]{6}$/;

/** "home" | "leaderboard" | "room" | "unknown" */
export function pathKind(pathname = "/") {
  const path = String(pathname).replace(/^\/+|\/+$/g, "");
  if (!path) return "home";
  if (path === "leaderboard") return "leaderboard";
  if (ROOM_CODE.test(path)) return "room";
  return "unknown";
}

/** The room code in an invite path, or null. */
export function roomCodeFrom(pathname = "/") {
  return pathKind(pathname) === "room" ? String(pathname).replace(/^\/+|\/+$/g, "") : null;
}
