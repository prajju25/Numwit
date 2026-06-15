// server/middleware/adminAuth.js
// HTTP Basic Auth gate for the /api/admin/* routes and the admin dashboard.
//
// Configured via the ADMIN_PASSWORD env var. The username is fixed ("admin")
// — only the password is checked. If ADMIN_PASSWORD isn't set, the admin
// surface is disabled entirely (503), so it's never accidentally left open.

const ADMIN_USERNAME = "admin";

function parseBasicAuth(header) {
  if (!header || header.indexOf("Basic ") !== 0) return null;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch (_) {
    return null;
  }
  const sepIndex = decoded.indexOf(":");
  if (sepIndex === -1) return null;
  return {
    username: decoded.slice(0, sepIndex),
    password: decoded.slice(sepIndex + 1),
  };
}

function adminAuth(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(503).json({ error: "Admin interface not configured" });
  }

  const creds = parseBasicAuth(req.headers.authorization);
  if (!creds || creds.username !== ADMIN_USERNAME || creds.password !== adminPassword) {
    res.set("WWW-Authenticate", 'Basic realm="Numwit Admin"');
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

module.exports = adminAuth;
