# Deploying Numwit to Fly.io

Target: **https://numwit.prajvex.com** — one always-on Fly Machine running the
Docker image (server + built client), Redis on Upstash, Postgres on Neon.

```
Browser ──HTTPS/WSS──> Fly.io (1 Machine, shared-cpu-1x, 512 MB)
                         ├── React client (client/dist)
                         ├── REST /api/*
                         └── Socket.IO
                               ├── Upstash Redis  (rooms / game state — required)
                               └── Neon Postgres  (stats, achievements, leaderboard)
```

Expected cost at launch: **~$3.70/month** (Machine $3.69 + egress at $0.02/GB;
Upstash and Neon on free plans; HTTPS cert free).

> **Why exactly one Machine?** Round timers, bot timers, reconnect grace periods
> and rate limits live in the Node process's memory. Two Machines would split
> players between servers that can't see each other's timers, and a stopped
> Machine loses every game in progress. `fly.toml` therefore disables
> auto-stop, and the first deploy uses `--ha=false`.

---

## 0. Before you start

- [ ] The `feature/ux-redesign` branch is merged (or you deploy from that branch).
- [ ] You can edit DNS for `prajvex.com`.
- [ ] You have your Neon project's connection strings (step 3).
- [ ] A card for Fly.io (no permanent free tier — billed per second).

## 1. Install flyctl and log in

Windows (PowerShell):

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Then open a **new** terminal:

```bash
fly auth signup      # or: fly auth login
fly version
```

## 2. Pick the region and app name

**Region** — put the Machine next to the database. In the Neon console open
your project → *Settings* and note the region, then set `primary_region` in
`fly.toml`:

| Neon region | Fly region |
|---|---|
| AWS US East (N. Virginia) `aws-us-east-1` | `iad` |
| AWS US East (Ohio) `aws-us-east-2` | `ord` |
| AWS US West (Oregon) `aws-us-west-2` | `sea` |
| AWS Europe (Frankfurt) `aws-eu-central-1` | `fra` |
| AWS Asia Pacific (Singapore) `aws-ap-southeast-1` | `sin` |
| AWS Asia Pacific (Mumbai) `aws-ap-south-1` | `bom` |

Check the current list with `fly platform regions`. Note: egress from India
(`bom`) is billed at $0.12/GB vs $0.02/GB in North America/Europe.

**App name** — must be globally unique on Fly. Create it (this also reserves
`<name>.fly.dev`):

```bash
fly apps create numwit
```

If `numwit` is taken, use e.g. `numwit-prajvex` and update `app = "..."` in
`fly.toml` to match.

> Don't run `fly launch` — it would generate a new `fly.toml` over the one in
> this repo. `fly apps create` + `fly deploy` uses ours as-is.

## 3. Get the database URLs (Neon)

In the Neon console → *Connection Details* for the production branch, copy
**both**:

- **Pooled** (host contains `-pooler`) → becomes `DATABASE_URL` (the app)
- **Direct** (no `-pooler`) → becomes `DIRECT_URL` (migrations only)

Both look like `postgresql://user:password@host/db?sslmode=require`.

Migrations run automatically on every deploy (`server/scripts/release.sh`),
using `DIRECT_URL`. Pending ones are applied; already-applied ones are skipped.

## 4. Create the Redis database (Upstash)

1. Sign in at <https://console.upstash.com> → **Create Database** (Redis).
2. Name: `numwit`. Region: the AWS region matching your Fly region
   (`iad` → us-east-1, `fra` → eu-central-1, `sin` → ap-southeast-1, `bom` → ap-south-1…).
3. Plan: **Free** (500K commands/month). If you later add a card, set a
   **budget cap** so pay-as-you-go can never exceed what you choose.
4. Leave **Eviction off** — rooms must not be silently evicted.
5. From the database page copy the **Redis URL** (TLS, starts with `rediss://`):
   `rediss://default:<password>@<name>.upstash.io:6379`

Why it stays within the free plan for longer: the Socket.IO Redis adapter now
only switches on when `REDIS_ADAPTER_URL` is set (needed only with 2+ Machines),
and `/api/stats` (polled every 10 s by every landing-page visitor) is cached
server-side for 10 s.

## 5. Set secrets

Secrets are encrypted and injected as environment variables. Non-secret
settings (`NODE_ENV`, `PORT`, `CORS_ORIGIN`, `BOT_FILL_ENABLED`) are already in
`fly.toml` under `[env]`.

```bash
fly secrets set \
  REDIS_URL="rediss://default:<password>@<name>.upstash.io:6379" \
  DATABASE_URL="postgresql://<user>:<password>@<pooler-host>/<db>?sslmode=require" \
  DIRECT_URL="postgresql://<user>:<password>@<direct-host>/<db>?sslmode=require" \
  ADMIN_PASSWORD="<a long random password>" \
  --stage
```

PowerShell: replace the trailing `\` with a backtick `` ` ``, or put it all on
one line. `--stage` stores them without restarting anything (nothing is
deployed yet).

| Secret | Required | Purpose |
|---|---|---|
| `REDIS_URL` | yes | room/game state |
| `DATABASE_URL` | for stats | Neon **pooled** URL — leave unset to run without persistence |
| `DIRECT_URL` | with `DATABASE_URL` | Neon **direct** URL — used only for migrations |
| `ADMIN_PASSWORD` | optional | enables `/admin` (Basic Auth, user `admin`); unset = admin disabled |

Do **not** set `REDIS_ADAPTER_URL` while running one Machine.

## 6. First deploy

From the repo root:

```bash
fly deploy --ha=false
```

- The image is built on Fly's remote builder (no local Docker needed).
- The release step logs `prisma migrate deploy` output before the new version
  goes live. If migrations fail, the deploy stops and the old version (if any)
  keeps running.
- `--ha=false` creates a single Machine (Fly's default is two).

Confirm exactly one Machine, in state `started`:

```bash
fly status
fly scale count 1 --yes   # only if status shows more than one
```

## 7. Verify on the fly.dev URL

```bash
curl https://numwit.fly.dev/api/health
```

Expect `"status":"ok"` and **`"redis":"ok"`**. If Redis shows `unavailable`,
re-check `REDIS_URL` (must be `rediss://`, TLS) with `fly secrets list` and
`fly logs`.

Then:

- `https://numwit.fly.dev/api/leaderboard` → returns data (Neon is wired up)
- Open `https://numwit.fly.dev` → landing page loads

## 8. Custom subdomain: numwit.prajvex.com

1. Ask Fly for a certificate:

   ```bash
   fly certs add numwit.prajvex.com
   ```

2. At the DNS provider for `prajvex.com`, add:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | CNAME | `numwit` | `numwit.fly.dev` | Auto / 300 |

   (Use your actual app name if it isn't `numwit`.) **Cloudflare:** set the
   record to *DNS only* (grey cloud) at least until the certificate is issued.

3. Watch the certificate status until it shows **Issued** (usually a few
   minutes after DNS propagates):

   ```bash
   fly certs show numwit.prajvex.com
   ```

4. Open **https://numwit.prajvex.com**.

`CORS_ORIGIN` in `fly.toml` is already `https://numwit.prajvex.com`. Same-origin
traffic (the page and its socket on the same host) isn't affected by CORS, so
`numwit.fly.dev` keeps working too.

## 9. Smoke test (do this on a phone and a laptop)

- [ ] Landing page shows the live demo animation and online stats
- [ ] Public room → bots fill in → a full game plays to the end
- [ ] Private room → copy invite link → a second device joins via the link
- [ ] Chat in the waiting room, then during the game (mobile chat sheet + desktop panel)
- [ ] Round reveal animation, game over screen, XP bar, "Share your win" card downloads
- [ ] Leaderboard shows your row; Share opens the card
- [ ] Switch tabs on the phone for ~20 s during a game, come back → you reconnect into the game
- [ ] `fly logs` shows no repeated errors

## 10. Day-to-day operations

| Task | Command |
|---|---|
| Live logs | `fly logs` |
| Status / health checks | `fly status`, `fly checks list` |
| Redeploy after changes | `fly deploy` |
| Restart | `fly machine restart <machine-id>` (ids from `fly status`) |
| Shell into the Machine | `fly ssh console` |
| List / roll back releases | `fly releases`, then `fly deploy --image <image-from-a-good-release>` |
| Change a secret | `fly secrets set KEY=value` (restarts the Machine) |
| More memory (if it OOMs) | `fly scale memory 1024` ($6.70/mo instead of $3.69) |

Deploys and restarts briefly disconnect players; the client's reconnect grace
period covers short blips, but games in progress during a deploy are lost.
Prefer deploying at quiet times.

## 11. Costs and alerts

| Item | Price | Expected |
|---|---|---|
| Machine shared-cpu-1x, 512 MB | $3.69/mo | $3.69 |
| Egress | $0.02/GB (NA/EU) | ~$0.02–0.20 |
| Shared IPv4 + IPv6, first 10 certs | free | $0 |
| Upstash Redis | free up to 500K commands/mo | $0 |
| Neon Postgres | free plan | $0 |

Check usage at <https://fly.io/dashboard> → *Billing*, and in the Upstash and
Neon consoles. If Upstash usage approaches the free limit, either add a card
with a budget cap or move Redis onto Fly.

## 12. Optional: deploy automatically from GitHub

1. `fly tokens create deploy -x 999999h` → add it as repository secret
   `FLY_API_TOKEN` (GitHub → Settings → Secrets and variables → Actions).
2. Add `.github/workflows/fly-deploy.yml`:

   ```yaml
   name: Deploy to Fly.io
   on:
     push:
       branches: [main]
   jobs:
     test-and-deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
         - run: npm ci --prefix server && npm test --prefix server
         - run: npm ci --prefix client && npm test --prefix client
         - uses: superfly/flyctl-actions/setup-flyctl@master
         - run: flyctl deploy --remote-only
           env:
             FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
   ```

Every push to `main` then runs both test suites and deploys only if they pass.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Release step fails with a Prisma connection error | `DIRECT_URL` missing or pointing at the pooler host — use Neon's direct URL |
| `/api/health` shows `"redis":"unavailable"` | `REDIS_URL` wrong or not `rediss://`; check `fly logs` for `Redis client error` |
| Players get split into different "rooms" / timers misbehave | More than one Machine — `fly scale count 1 --yes` |
| Site takes a while to respond after idle | Auto-stop got enabled — check `fly.toml` has `auto_stop_machines = "off"` and `min_machines_running = 1` |
| Machine restarts with out-of-memory | `fly scale memory 1024` |
| Certificate stuck "Awaiting configuration" | CNAME missing/wrong, or Cloudflare proxy (orange cloud) on — switch to DNS only |
