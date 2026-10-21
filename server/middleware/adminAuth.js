// server/middleware/adminAuth.js
// HTTP Basic Auth gate for the /api/admin/* routes and the admin dashboard.
//
// Configured via the ADMIN_PASSWORD env var (a Fly secret in production —
// stored like any server secret; see docs/FLY_DEPLOYMENT.md). The username is
// fixed ("admin"). If ADMIN_PASSWORD isn't set, the admin surface is disabled
// entirely (503), so it's never accidentally left open.
//
// Basic Auth only base64-encodes the password; it is protected in transit by
// HTTPS (force_https on Fly + HSTS from helmet). On top of that:
//   - comparison is constant-time (no timing hints about how much matched);
//   - repeated wrong passwords are locked out per IP, with a global ceiling
//     so rotating IPs doesn't allow unlimited guessing;
//   - state-changing requests (delete, merge, status changes) must come from
//     this site — the browser re-sends Basic credentials automatically, so a
//     page on another site must not be able to trigger admin actions.

const crypto = require("crypto");

const ADMIN_USERNAME = "admin";

const WINDOW_MS = 15 * 60 * 1000;   // failures are counted over 15 minutes
const MAX_FAILS_PER_IP = 10;        // then that IP is locked out for the window
const MAX_FAILS_GLOBAL = 100;       // and everyone is, past this many in total

const failsByIp = new Map();        // ip → { count, resetAt }
let globalFails = { count: 0, resetAt: 0 };

function parseBasicAuth(header) {
  if (!header || header.indexOf("Basic ") !== 0) return null;
  // Buffer.from(..., "base64") never throws — it drops invalid characters —
  // so a malformed header simply fails the username/password check below.
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sepIndex = decoded.indexOf(":");
  if (sepIndex === -1) return null;
  return {
    username: decoded.slice(0, sepIndex),
    password: decoded.slice(sepIndex + 1),
  };
}

/** Constant-time string equality (hashing first makes the lengths equal). */
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** The visitor's IP. Fly's proxy sets Fly-Client-IP itself (clients can't). */
function clientIp(req) {
  return req.headers["fly-client-ip"] || req.ip || req.socket?.remoteAddress || "unknown";
}

/** IP for the logs, with the last part hidden (203.0.113.x, 2001:db8:…:x). */
function maskIp(ip) {
  const s = String(ip || "unknown");
  if (s.includes(".")) return s.replace(/\.\d+$/, ".x");
  if (s.includes(":")) return s.replace(/:[0-9a-f]*$/i, ":x");
  return s;
}

function currentCount(entry, now) {
  return entry && entry.resetAt > now ? entry.count : 0;
}

function recordFailure(ip, now) {
  const entry = failsByIp.get(ip);
  failsByIp.set(ip, entry && entry.resetAt > now
    ? { count: entry.count + 1, resetAt: entry.resetAt }
    : { count: 1, resetAt: now + WINDOW_MS });
  globalFails = globalFails.resetAt > now
    ? { count: globalFails.count + 1, resetAt: globalFails.resetAt }
    : { count: 1, resetAt: now + WINDOW_MS };
  // Keep the map from growing without bound
  if (failsByIp.size > 10000) {
    for (const [key, e] of failsByIp) if (e.resetAt <= now) failsByIp.delete(key);
  }
}

/** Is a state-changing request coming from another site? */
function isCrossSite(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = req.headers.origin;
  if (!origin) return false; // non-browser clients (curl) send no Origin
  try {
    return new URL(origin).host !== req.headers.host;
  } catch (_) {
    return true; // "null" or garbage origin
  }
}

function adminAuth(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(503).json({ error: "Admin interface not configured" });
  }

  const now = Date.now();
  const ip = clientIp(req);
  const ipFails = currentCount(failsByIp.get(ip), now);
  if (ipFails >= MAX_FAILS_PER_IP || currentCount(globalFails, now) >= MAX_FAILS_GLOBAL) {
    const resetAt = ipFails >= MAX_FAILS_PER_IP ? failsByIp.get(ip).resetAt : globalFails.resetAt;
    res.set("Retry-After", String(Math.ceil((resetAt - now) / 1000)));
    return res.status(429).json({ error: "Too many failed sign-ins. Try again later." });
  }

  const creds = parseBasicAuth(req.headers.authorization);
  // Check both parts (no short-circuit), so timing doesn't reveal which was wrong
  const userOk = !!creds && safeEqual(creds.username, ADMIN_USERNAME);
  const passOk = !!creds && safeEqual(creds.password, adminPassword);
  if (!userOk || !passOk) {
    // A request with no credentials at all is the browser asking for the
    // login box — only real wrong attempts count towards the lockout.
    if (creds) {
      recordFailure(ip, now);
      const fails = currentCount(failsByIp.get(ip), now);
      console.warn(`admin: failed sign-in from ${maskIp(ip)} (${fails}/${MAX_FAILS_PER_IP})`);
      if (fails === MAX_FAILS_PER_IP) {
        console.warn(`admin: sign-in locked for ${maskIp(ip)} for ${WINDOW_MS / 60000} min`);
      }
      if (currentCount(globalFails, now) === MAX_FAILS_GLOBAL) {
        console.warn(`admin: ${MAX_FAILS_GLOBAL} failed sign-ins — admin sign-in locked for everyone for ${WINDOW_MS / 60000} min`);
      }
    }
    res.set("WWW-Authenticate", 'Basic realm="Numwit Admin"');
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (isCrossSite(req)) {
    return res.status(403).json({ error: "Admin actions must come from the admin page" });
  }

  next();
}

/** Test helper: forget all recorded failures. */
adminAuth.resetLockouts = function resetLockouts() {
  failsByIp.clear();
  globalFails = { count: 0, resetAt: 0 };
};

adminAuth.maskIp = maskIp;

module.exports = adminAuth;
