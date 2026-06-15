# Neon Postgres + Render — Production Setup

Steps to point Numwit's Prisma layer at your Neon production database and configure Render.

## 1. Get the right connection string from Neon

Neon gives you two connection strings per database:

- **Pooled** (`-pooler` in the hostname) — use this for `DATABASE_URL`. The app's Prisma client uses short-lived queries, so pooled connections are the right default for the running server.
- **Direct** (no `-pooler`) — use this for running migrations. Prisma's migration engine needs a direct connection; running `prisma migrate deploy` through the pooler can fail or behave inconsistently.

Both look like:
```
postgresql://<user>:<password>@<host>/<db>?sslmode=require
```

## 2. Run the migrations against Neon (one-time + whenever you add migrations)

From your machine (or any environment with network access to Neon), using the **direct** connection string:

```bash
cd server
DATABASE_URL="postgresql://<user>:<password>@<direct-host>/<db>?sslmode=require" npx prisma migrate deploy
```

This applies, in order:
- `prisma/migrations/20260606170240_init/` — User, SessionStat, Achievement, UserAchievement tables
- `prisma/migrations/20260615180000_add_feedback/` — Feedback table (admin dashboard)

`migrate deploy` only applies pending migrations and never prompts — safe to re-run (no-op if already applied).

Then generate the Prisma client (also happens automatically on `npm install` via Prisma's postinstall, but run it explicitly if needed):

```bash
npx prisma generate
```

## 3. Render environment variables

In the Render dashboard, on the web service → **Environment**, set:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** connection string | enables stats/achievements/feedback persistence |
| `ADMIN_PASSWORD` | a strong, unique password | enables `/admin` dashboard + `/api/admin/*` (Basic Auth, username `admin`); leave unset to keep the admin interface disabled |
| `REDIS_URL` | your Redis connection string | required — room/game state |
| `NODE_ENV` | `production` | |
| `CORS_ORIGIN` | your production domain, e.g. `https://numwit.onrender.com` | or `*` for single-origin deploys |
| `PORT` | (Render sets this automatically) | leave unset |

After saving, Render redeploys automatically. No code changes are needed — `server/db/prismaClient.js` already falls back to "no persistence" if `DATABASE_URL` is unset, and `server/middleware/adminAuth.js` returns 503 if `ADMIN_PASSWORD` is unset, so both are safe to add at any time.

## 4. Verify after deploy

- `GET /api/health` → `{ "status": "ok", "redis": "ok", ... }`
- `GET /api/leaderboard` → returns real data instead of an empty array (confirms `DATABASE_URL` is wired up and migrations ran)
- Visit `/admin` → browser prompts for Basic Auth (`admin` / `ADMIN_PASSWORD`); dashboard shows live room stats and the feedback table

## 5. Future migrations

Whenever you change `prisma/schema.prisma`:

```bash
cd server
npx prisma migrate dev --name <description>   # creates a new migration locally (uses your local/dev DB)
```

Commit the new `prisma/migrations/<timestamp>_<description>/` folder, then re-run step 2 (`prisma migrate deploy` with the Neon **direct** URL) against production.
