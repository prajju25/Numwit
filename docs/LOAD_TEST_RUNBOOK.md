# Load test before Show HN — runbook

*Written 18 Oct 2026. Replaces the Render-era numbers in LOAD_TESTING_STRATEGY.md (that
document's analysis still applies; its capacity tables were measured on Render).
Results of the first run are at the end.*

**Goal:** prove one Fly machine survives a Show HN day — about **150 people at once with a
spike to 300** — and find the real ceiling.

**Approach:** test the **real production app** (same machine, region, settings, URL and
Redis) but point it at a **separate Neon branch** for the hour of the test, so fake games
never touch the real leaderboard, admin numbers or the anonymous round log.

Redis stays on production `numwit-cache`: Upstash's free plan allows only one database, and
it holds nothing but live rooms, which delete themselves a few minutes after a game. The
cost is that the test uses up production's **monthly command allowance** — see the budget
below before every run.

---

## 0. Before you start (once)

- [ ] **Pick a quiet hour.** Umami → Overview → *Today* / hourly chart. Anyone who plays during
      the test plays on the test copy, and the two restarts end games in progress.
- [ ] **Save the production connection strings** in your password manager — Fly never shows a
      secret again once it's set: Neon → your project → **Connect** → branch `production` (or
      `main`) → copy the **pooled** URL (host has `-pooler`) and the **direct** URL.
- [ ] **Check the Redis budget:** Upstash → `numwit-cache` → **Usage** → commands this month.

  | Test | Redis commands (measured / estimated) |
  |---|---|
  | smoke (`hn-smoke-test.js`) | a few thousand |
  | Show HN day (`hn-test.js`) | **~194K** measured (before the fix below; expect less now) |
  | breakpoint (`breakpoint-test.js`) | **~400K+** estimated |

  The free plan allows **500K a month**. If a test would go past it, Upstash starts
  rejecting commands and **the live site stops working until the monthly reset**. So: only
  run a test the remaining allowance covers, or switch Upstash to **pay-as-you-go with a
  budget cap** first (about $0.20 per 100K commands — a breakpoint run costs ~$1).
- [ ] k6 installed: `k6 version` (if not: `winget install k6 --source winget`).

## 1. Create the test database (~5 min)

1. Neon → your project → **Branches** → **Create branch**.
2. Name `loadtest`, parent = your production branch, **Current data** (a full copy — the
   leaderboard looks normal during the test). Compute: same size as production.
3. Open the branch → **Connect** → copy its **pooled** and **direct** URLs.

## 2. Point production at the test database (~2 min, restarts the app)

One line, so it works in PowerShell and bash alike (or set the two secrets in the Fly
dashboard → `numwit` → **Secrets**):

```bash
fly secrets set -a numwit DATABASE_URL="<loadtest pooled URL>" DIRECT_URL="<loadtest direct URL>"
```

Wait for `fly status -a numwit` to show the machine **started**, then open
https://numwit.prajvex.com — it should load and the leaderboard should look normal.

## 3. Run the tests (from `load-tests/`)

Open three dashboards side by side first:
- **Fly** → `numwit` → **Metrics** (memory, CPU, connections) — and a terminal with
  `fly logs -a numwit`
- **Upstash** → `numwit-cache` → **Usage** (commands/sec, latency, memory)
- **Neon** → `loadtest` branch → **Monitoring** (connections, CPU)

```bash
cd load-tests

# 1) Smoke — 2 min, 5 players. Must pass before anything else.
k6 run -e BASE_URL=https://numwit.prajvex.com hn-smoke-test.js --summary-export results/fly-smoke.json

# 2) Show HN day — ~23 min: 150 steady, spike to 300.
k6 run -e BASE_URL=https://numwit.prajvex.com hn-test.js --summary-export results/fly-hn.json

# 3) Optional, and only with the Redis budget for it (see 0.): breakpoint — up to 800
#    players, stops itself when things degrade.
k6 run -e BASE_URL=https://numwit.prajvex.com breakpoint-test.js --summary-export results/fly-breakpoint.json
```

During the spike (minutes 15–19 of `hn-test`), **screenshot** the Fly memory/CPU graph and the
Upstash and Neon panels. Afterwards search the logs for `roomLock: slow` — any line names a
room whose updates were held up, and which step held them.

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

Also look at the **max** values in the JSON summary, not only p95: a single very large
maximum shared by several metrics means one room got stuck.

## 4. Switch back to production (~2 min, restarts the app) — don't skip

```bash
fly secrets set -a numwit DATABASE_URL="<production pooled URL>" DIRECT_URL="<production direct URL>"
```

Check: the site loads, `/api/health` says `"redis":"ok"`, one real game you play shows up
in the production branch, and **/admin → Players** has **no `k6-…` players**.

## 5. Clean up

- Neon → Branches → `loadtest` → **Delete** (every fake game goes with it).
- Redis needs nothing: test rooms delete themselves (the Upstash *Keyspace* graph drops back
  to near zero a few minutes after the test).

## Notes

- Fake players are named `k6-…` and use `k6-…` device ids, so they're easy to spot.
- k6 runs no JavaScript in a browser, so **Umami is not affected**.
- k6 neither asks for compressed responses nor caches, so it downloads the full bundle on
  every visitor loop: the test's data transfer overstates real bandwidth by a lot.
- In the `--summary-export` JSON, `"thresholds": { "p(95)<800": false }` means the
  threshold was **not** crossed (passed). For rates, `passes` counts *true* values — so
  `connect_fail_rate: passes 0` means zero failed connections.
- Public rooms that get 3+ k6 players within the first minute never start (bots aren't
  added, and k6 never presses *Start*); they are idle-deleted after 5 minutes and k6
  counts them as finished. Real public rooms have a host who can press *Start*.

---

## Results — 18 Oct 2026 (Fly `numwit`, 1 × shared-cpu, 512 MB, iad)

**Smoke:** all clean — 4 games, 43/43 picks accepted, pick ack p95 294 ms, first round
p95 604 ms, 0 failures.

**Show HN day (`hn-test.js`): all thresholds passed.**

| | Result |
|---|---|
| peak players | 300 (Fly concurrency ~255) |
| games completed / timed out | 821 / 1 |
| pick ack p95 / p99 | 306 / 335 ms (≈ the network round trip — the server adds a few ms) |
| round result p95 | 309 ms |
| first round p95 | 617 ms |
| failed connections, rejected picks, HTTP errors | 0% / 0 of 5,809 / 0% |
| `/api/stats` p95 | 741 ms (one GET per room — fixed, see below) |
| leaderboard p95 | 344 ms |
| Fly memory | ~110 → ~140 MB of 459 MB; no restarts |
| Fly CPU load | peak ~0.35 |
| Neon (0.25–2 CU) | stayed at 0.25 CU, CPU ~0.03, 100% cache hit, 0 deadlocks, ≤3 pooled connections |
| Neon storage | +~3 MB for ~820 games (~4 KB per game) |
| Upstash | **194K commands** for the run, peak ~280/s, latency ~0 ms |

**Verdict:** one machine handles a Show HN day with a lot of headroom; the database is
nearly idle. **The first limit is the Upstash free allowance**, not the server — switch to
pay-as-you-go with a budget cap before launch.

**Found and fixed after the run:**
- **One public game froze for ~176 s.** `pick_ack`, `round_result` and `first_round` all had
  a maximum of ~176 s (a few samples, all in one moment), and one game hit the 8-minute cap.
  The exact trigger isn't proven, but several room updates were writing the room *without*
  waiting their turn on the room lock (a player disconnecting, leaving, the 60 s grace
  timeout, the next-round step) — so they could overwrite picks and round state. They are
  now locked too, and any lock held or waited on for over 2 s is logged
  (`roomLock: slow …`) so a repeat names the room and the step.
- **Every disconnect scanned all rooms in Redis** (`KEYS` + one `GET` per room until it found
  the player) — slow with hundreds of rooms and most of the run's Redis commands. Leaving
  now reads the player's own room directly.
- **`/api/stats` fetched rooms one GET at a time** — now one `MGET`.
- The k6 script didn't send the player with each pick (`User=undefined` in the logs).
