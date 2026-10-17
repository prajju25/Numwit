# Load test before Show HN — runbook

*Written 18 Oct 2026. Replaces the Render-era numbers in LOAD_TESTING_STRATEGY.md (that
document's analysis still applies; its capacity tables were measured on Render).*

**Goal:** prove one Fly machine survives a Show HN day — about **150 people at once with a
spike to 300** — and find the real ceiling.

**Approach:** test the **real production app** (same machine, region, settings and URL) but
point it at a **separate Neon branch and Upstash database** for the hour of the test, so fake
games never touch the real leaderboard, admin numbers or the anonymous round log.

---

## 0. Before you start (once)

- [ ] **Pick a quiet hour.** Umami → Overview → *Today* / hourly chart. Anyone who plays during
      the test plays on the test copy, and the two restarts end games in progress.
- [ ] **Save the production connection strings** in your password manager — Fly never shows a
      secret again once it's set:
  - Neon → your project → **Connect** → branch `production` (or `main`) → copy the
    **pooled** URL (host has `-pooler`) and the **direct** URL.
  - Upstash → `numwit-cache` → **Connect** → copy the `rediss://…` URL.
- [ ] k6 installed: `k6 version` (if not: `winget install k6 --source winget`).

## 1. Create the test copies (~10 min)

**Neon branch**
1. Neon → your project → **Branches** → **Create branch**.
2. Name `loadtest`, parent = your production branch, **Current data** (a full copy — the
   leaderboard looks normal during the test). Compute: same size as production.
3. Open the branch → **Connect** → copy its **pooled** and **direct** URLs.

**Upstash database**
1. Upstash → **Create database** → name `numwit-loadtest`, region **N. Virginia
   (us-east-1)** (same as production), free plan.
2. Copy its `rediss://…` URL.

## 2. Point production at the test copies (~2 min, restarts the app)

```bash
fly secrets set -a numwit \
  DATABASE_URL="<loadtest pooled URL>" \
  DIRECT_URL="<loadtest direct URL>" \
  REDIS_URL="<numwit-loadtest rediss URL>"
```

Wait for `fly status -a numwit` to show the machine **started**, then open
https://numwit.prajvex.com — it should load and the leaderboard should look normal.

## 3. Run the tests (from `load-tests/`, ~40 min)

Open three dashboards side by side first:
- **Fly** → `numwit` → **Metrics** (memory, CPU, connections) — and a terminal with
  `fly logs -a numwit`
- **Upstash** → `numwit-loadtest` → **Usage** (commands/sec, latency, memory)
- **Neon** → `loadtest` branch → **Monitoring** (connections, CPU)

```bash
cd load-tests

# 1) Smoke — 2 min, 5 players. Must pass before anything else.
k6 run -e BASE_URL=https://numwit.prajvex.com hn-smoke-test.js --summary-export results/fly-smoke.json

# 2) Show HN day — ~23 min: 150 steady, spike to 300.
k6 run -e BASE_URL=https://numwit.prajvex.com hn-test.js --summary-export results/fly-hn.json

# 3) Optional: breakpoint — up to 800 players, stops itself when things degrade.
k6 run -e BASE_URL=https://numwit.prajvex.com breakpoint-test.js --summary-export results/fly-breakpoint.json
```

During the spike (minutes 15–19 of `hn-test`), **screenshot** the Fly memory/CPU graph and the
Upstash and Neon panels.

**What "good" looks like** (from India — the network round trip to Virginia is ~250 ms, so
compare with the smoke test's numbers; what matters is how much worse it gets under load):

| Metric | Smoke (idle) | Show HN pass |
|---|---|---|
| `pick_ack_ms` p95 — server accepts a pick | ≈ round trip | < 800 ms |
| `round_result_ms` p95 — result once everyone picked | ≈ round trip | < 1 s |
| `first_round_ms` p95 — join → first round | < 1 s | < 5 s |
| `connect_fail_rate` | 0% | < 3% |
| `pick_accepted_rate` | 100% | > 98% |
| stats / leaderboard p95 | — | < 1 s / < 1.5 s |
| Fly | — | no restart, no "Out of memory" in `fly logs`, memory < ~450 MB |

## 4. Switch back to production (~2 min, restarts the app) — don't skip

```bash
fly secrets set -a numwit \
  DATABASE_URL="<production pooled URL>" \
  DIRECT_URL="<production direct URL>" \
  REDIS_URL="<production rediss URL>"
```

Check: the site loads; **/admin → Players** has **no `k6-…` players**; the leaderboard shows
real players only.

## 5. Clean up

- Neon → Branches → `loadtest` → **Delete** (every fake game goes with it).
- Upstash → `numwit-loadtest` → **Delete**.
- Send the three `results/fly-*.json` files (or the terminal summaries) and the screenshots
  to review. Possible fixes depending on what they show: a short cache on the public
  leaderboard, a Node memory cap, quieter per-pick logging, a higher Fly connection limit
  (`hard_limit = 600` in fly.toml caps one machine — the breakpoint test will hit it).

## Notes

- Fake players are named `k6-…` and use `k6-…` device ids, so they're easy to spot.
- k6 runs no JavaScript in a browser, so **Umami is not affected**.
- The test uses the test Upstash database, so it doesn't eat into production's command
  allowance; the free plan is enough for one run (check Upstash → Usage after the HN test to
  see how many commands a busy day needs — that sizes the production plan).
