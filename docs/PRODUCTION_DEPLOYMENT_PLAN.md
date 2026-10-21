# Numwit — Production Deployment Plan

Stack: Express 5 + Socket.IO (server), React 19 + Webpack (client), Redis (room/game state), Postgres via Prisma (stats/achievements, optional).

This plan covers what needs to change in the code, what infrastructure to provision, and the order of operations to take Numwit public.

---

## 1. Current state — what's already in place

- `Dockerfile` builds the client (`client/dist`) and copies it next to the server, exposes port 5000, runs `node server.js`.
- `docker-compose.yml` wires up a Redis container + the app container.
- `@socket.io/redis-adapter` is already wired in `server.js` and activates automatically if `REDIS_URL`/`REDIS_ADAPTER_URL` is set — horizontal scaling is partially supported.
- `/api/health`, `/api/stats`, `/api/leaderboard` endpoints exist.
- Prisma schema for Postgres exists (User, SessionStat, Achievement, UserAchievement) — app runs fine without `DATABASE_URL` (stats just won't persist).
- `.env.example` documents `PORT`, `NODE_ENV`, `REDIS_URL`, `DATABASE_URL`, `REDIS_ADAPTER_URL`.
- `client/src/socket.jsx` connects to `window.location.origin` — i.e. it **assumes** the client is served from the same origin as the API/socket server (single-origin deployment).

## 2. Critical gaps to fix before deploying

These are code changes, not infra — do these first.

1. **Server doesn't actually serve the client build.** `server.js` never calls `express.static(...)`, even though the Dockerfile builds `client/dist` and the client assumes same-origin hosting. Add, near the top of `server.js`:
   ```js
   const path = require("path");
   app.use(express.static(path.join(__dirname, "../client/dist")));
   // catch-all for client-side routing — must come AFTER all /api routes and BEFORE server.listen
   app.get(/^\/(?!api|socket\.io).*/, (req, res) => {
     res.sendFile(path.join(__dirname, "../client/dist/index.html"));
   });
   ```
   Without this, the deployed server returns nothing for `/` and the game UI never loads.

2. **`CORS_ORIGIN` defaults to `"*"`.** Fine for same-origin deployment (recommended — see §4), but if the client is ever hosted separately, this must be set to the exact client URL (wildcard `*` + credentials doesn't work with Socket.IO anyway). Add to `server/.env`: `CORS_ORIGIN=https://yourdomain.com`.

3. **No `helmet`.** Add basic security headers:
   ```bash
   npm install helmet --prefix server
   ```
   ```js
   const helmet = require("helmet");
   app.use(helmet({ contentSecurityPolicy: false })); // CSP needs tuning for inline scripts/sockets — start disabled, enable later
   ```

4. **No rate limiting on REST endpoints.** The existing `server/utils/rateLimiter.js` only covers Socket.IO events. Add `express-rate-limit` to the REST API (especially `/api/room/code` and `/api/player/:deviceId/stats`):
   ```bash
   npm install express-rate-limit --prefix server
   ```
   ```js
   const rateLimit = require("express-rate-limit");
   app.use("/api", rateLimit({ windowMs: 60_000, max: 100 }));
   ```

5. **In-memory rate limiter won't survive multiple instances.** `rateLimiter.js` stores state in a process-local `Map`. This is fine for a single instance (recommended starting point), but if you scale to 2+ instances, a malicious client can bypass limits by reconnecting to a different node. Not a launch blocker — note it for the scaling phase (§9).

6. **No global error handler / unhandled rejection logging.** Add at the bottom of `server.js`, before `server.listen`:
   ```js
   process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
   app.use((err, req, res, next) => {
     console.error(err);
     res.status(500).json({ error: "Internal server error" });
   });
   ```

7. **Prisma client generation in Docker.** The Dockerfile runs `npm install` in `server/` but never `npx prisma generate` or `npx prisma migrate deploy`. If `DATABASE_URL` is set, add to the Dockerfile (after `npm install`):
   ```dockerfile
   RUN npx prisma generate
   ```
   and run migrations as a one-off release step (not inside the container's `CMD`), e.g. `npx prisma migrate deploy`.

8. **Secrets hygiene.** Confirm `server/.env` is not committed (it's in `.gitignore` — good). Double-check `git log` / `git ls-files` doesn't already contain it from the "Initial commit". If it does, rotate any real credentials and purge it from history.

## 3. Recommended architecture for launch

**Single-origin, single-region, single instance** — matches what the code already expects and is the cheapest/simplest to get right:

```
[Browser] ──HTTPS──> [Node/Express server]
                         ├── serves client/dist (static React build)
                         ├── REST API (/api/*)
                         └── Socket.IO (/socket.io)
                              │
                              ├── Redis  (room/game state, required)
                              └── Postgres (stats/achievements, optional)
```

This avoids CORS entirely (client and API share an origin) and avoids the sticky-session requirement that comes with multiple Socket.IO instances. Scale vertically first; only move to multi-instance + Redis adapter + sticky sessions once you have real concurrency data (see §9).

## 4. Hosting options

| Option | Good for | Notes |
|---|---|---|
| **Fly.io** | Recommended for Socket.IO | Full Docker support (your existing `Dockerfile` works as-is), persistent connections, global regions if needed later, generous free allowance. |
| **Render** | Simple, predictable pricing | Web Service from Dockerfile, supports WebSockets, free tier sleeps after inactivity (bad for a "always on" game lobby) — use a paid instance ($7/mo) for an always-on demo. |
| **Railway** | Fastest to set up | Auto-detects Node, usage-based pricing (~$2–5/mo for small apps), but has had reported issues with long-lived WebSocket connections — verify with a load test before committing. |

**Recommendation:** Fly.io or Render, deployed from the existing `Dockerfile`. Both support the single-container architecture in §3 directly.

## 5. Database & Redis (managed services)

Don't run Redis/Postgres in containers alongside the app for production — use managed services so data survives redeploys.

- **Redis**: Upstash (serverless Redis, pay-per-request, generous free tier) or Redis Cloud. Set `REDIS_URL` to the provided connection string. This is **required** — room/game state lives here.
- **Postgres** (optional, for stats/achievements/leaderboard): Neon (serverless Postgres, scale-to-zero, free tier) or Supabase. Set `DATABASE_URL`. If you skip this, `/api/leaderboard` and `/api/player/:id/stats` degrade gracefully (the code already handles missing `DATABASE_URL`).

Both Upstash and Neon have free tiers sufficient for a small public game — start there, upgrade only if usage demands it.

## 6. Environment variables checklist

Set these in the hosting platform's secrets/env UI (never commit them):

| Variable | Required | Value |
|---|---|---|
| `PORT` | platform usually sets this | leave default or match platform |
| `NODE_ENV` | yes | `production` |
| `REDIS_URL` | yes | Upstash/Redis Cloud connection string (use `rediss://` for TLS) |
| `DATABASE_URL` | optional | Neon/Supabase Postgres connection string |
| `CORS_ORIGIN` | yes | your production domain, e.g. `https://numwit.com` (or omit if single-origin and you trust default) |
| `SOCKET_PING_INTERVAL` / `SOCKET_PING_TIMEOUT` | optional | defaults (20000/10000) are fine; shorter intervals cost CPU with many players |
| `REDIS_ADAPTER_URL` | only when scaling to >1 instance | same as `REDIS_URL` initially |
| `SENTRY_DSN` | recommended | from Sentry project (see §8) |

## 7. Domain & HTTPS

1. Buy a domain (Namecheap, Cloudflare Registrar, etc.).
2. Point DNS at your host (Fly.io/Render both document the required A/CNAME records).
3. TLS is handled automatically by Fly.io/Render (Let's Encrypt) — no manual cert management needed.
4. Once the domain is live, set `CORS_ORIGIN` to the real `https://` domain and redeploy.

## 8. Monitoring, logging, error tracking

- **Sentry** (`@sentry/node`): catches uncaught exceptions, unhandled rejections, and socket handler errors. Install, init at the very top of `server.js` before other requires, and add the Sentry error middleware after routes.
- **Structured logs**: the codebase uses `console.log`/`console.debug`/`console.error` throughout. Most hosts (Fly.io, Render) capture stdout/stderr and provide log viewers/search out of the box — sufficient for launch. Consider switching to a JSON logger (e.g. `pino`) later if log volume grows.
- **`/api/health`** already exists — wire it up to the host's health-check config (Fly.io `[[services.http_checks]]`, Render health check path) so the platform auto-restarts a hung instance.
- **Uptime monitoring**: a free service (UptimeRobot, Better Uptime) pinging `/api/health` every few minutes gives you alerting with near-zero setup.

## 9. Scaling considerations (post-launch, not blockers)

- **Sticky sessions**: required the moment you run >1 Socket.IO instance behind a load balancer. Fly.io and Render both support this (Fly: `fly_replay` / single-machine routing per connection; Render: documented sticky session support on paid plans).
- **Redis adapter**: already implemented — set `REDIS_ADAPTER_URL` (can reuse `REDIS_URL`) when you add a second instance.
- **In-memory rate limiter**: move `server/utils/rateLimiter.js` to a Redis-backed implementation before scaling beyond one instance, otherwise per-socket limits become per-instance limits.
- **Bot/timer services**: confirm `botService` / `timerService` use room state in Redis rather than process-local timers that would duplicate across instances (worth a quick audit before scaling).

## 10. CI/CD (lightweight)

A minimal GitHub Actions workflow on push to `main`:

1. `npm test --prefix server` and `npm test --prefix client` (you already have 305 + 334 passing tests — wire these in as a merge gate).
2. On success, trigger the platform's deploy:
   - Fly.io: `flyctl deploy` via the `superfly/flyctl-actions` GitHub Action.
   - Render: auto-deploys on push by default once connected to the GitHub repo — no extra workflow needed beyond the test gate.

## 11. Pre-launch checklist

- [ ] Add static-file serving + SPA catch-all route to `server.js` (§2.1)
- [ ] Set real `CORS_ORIGIN` (§2.2)
- [ ] Add `helmet` (§2.3)
- [ ] Add `express-rate-limit` to `/api/*` (§2.4)
- [ ] Add global error handler + unhandled rejection logging (§2.6)
- [ ] Add `npx prisma generate` to Dockerfile if using Postgres (§2.7)
- [ ] Verify `server/.env` was never committed; rotate secrets if it was (§2.8)
- [ ] Provision Upstash Redis, set `REDIS_URL`
- [ ] (Optional) Provision Neon Postgres, set `DATABASE_URL`, run `npx prisma migrate deploy`
- [ ] Deploy container to Fly.io or Render
- [ ] Point custom domain + verify HTTPS
- [ ] Wire `/api/health` into platform health checks
- [ ] Add Sentry for error tracking
- [ ] Add uptime monitor on `/api/health`
- [ ] Smoke test: create a room, play a full round, confirm sockets reconnect after a server restart

## 12. Rough cost estimate (single instance, low traffic)

| Item | Cost |
|---|---|
| Fly.io / Render small instance | $0–7/mo |
| Upstash Redis (free tier) | $0 |
| Neon Postgres (free tier) | $0 |
| Domain | ~$10–15/yr |
| Sentry (free tier) | $0 |

A public demo can realistically run for **under $10/month** until traffic grows enough to need paid tiers.

---

## Sources

- [Deploying Node.js Apps: Comparing Railway, Render, and Fly.io](https://dev.to/whoffagents/deploying-nodejs-apps-comparing-railway-render-and-flyio-4cfj)
- [Railway vs Render vs Fly.io for Solo Developers in 2026](https://devtoolpicks.com/blog/railway-vs-render-vs-fly-io-solo-developers-2026)
- [Scaling Socket.IO: Real-world challenges and proven strategies (Ably)](https://ably.com/topic/scaling-socketio)
- [Socket.IO docs — Tutorial step #9: Scaling horizontally](https://socket.io/docs/v4/tutorial/step-9)
- [Express.js — Production Best Practices: Security](https://expressjs.com/en/advanced/best-practice-security/)
- [Node.js Security Basics: Rate Limiting, Sanitization & Helmet](https://prateeksha.com/blog/nodejs-security-basics-rate-limiting-input-sanitization-helmet-setup)
- [Upstash for Redis vs Supabase vs Neon (2026)](https://www.marktechpost.com/2026/05/19/upstash-for-redis-vs-supabase-vs-neon-which-one-fits-vibe-coding-workflows-in-2026/)
- [10 Best Managed Postgres Providers Compared (2026)](https://dreamlit.ai/blog/top-10-managed-postgres-providers)
- [Sentry — How to debug, log, and monitor performance in Node.js](https://sentry.io/answers/how-to-debug-log-and-monitor-performance-in-node-js/)
- [Fixing CORS in your SPA](https://dev.to/eslachance/fixing-cors-in-your-spa-dfg)
