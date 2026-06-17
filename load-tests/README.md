# Numwit Load Tests

3 tests, run them in order. Each one sends fake players to your live game.

---

## Step 1 — Install k6

Go to https://k6.io/docs/get-started/installation/ and install for your OS.

**Windows (easiest way):**
```
winget install k6 --source winget
```

**Verify it worked:**
```
k6 version
```
You should see something like: `k6 v0.55.0 ...`

---

## Step 2 — Open terminal in this folder

```
cd C:\D_drive\Programming\Projects\Numwit\load-tests
```

---

## Step 3 — Run Smoke Test first

```
k6 run smoke-test.js
```

**What it does:** Sends 5 fake players for 2 minutes. Just checks if the game is alive.

**What you'll see:**
```
  ✓ ✅ /api/health returns 200
  ✓ ✅ Socket.IO handshake got session ID
  ✓ ✅ Game round was received
  ✓ ✅ Round result was received

  checks.........................: 100.00% ✓ 40  ✗ 0
  http_req_duration..............: avg=145ms  p(95)=320ms
  http_req_failed................: 0.00%   ✓ 0   ✗ 0
```

**Green ✓ = PASS.  Red ✗ = something is broken.**

If smoke test passes → go to Step 4.
If smoke test fails → do NOT run the other tests. Fix the issue first.

---

## Step 4 — Run Baseline Test

```
k6 run baseline-test.js
```

Or save results to a file (recommended — keep it for comparison later):
```
k6 run baseline-test.js --summary-export results/baseline-summary.json
```

**What it does:** Sends 20 fake players for 15 minutes. Measures how fast your game is today.

**What to look at in the output:**
```
round_result_latency_ms
  avg=85ms   p(50)=72ms   p(95)=210ms   p(99)=450ms
```

This means:
- Average time for a round result to arrive: 85ms ← good
- 95% of rounds arrived within 210ms ← good (target is under 500ms)
- 99% of rounds arrived within 450ms ← good (target is under 1000ms)

```
games_completed: 47   ← 47 full games completed in 15 min
submit_success_rate: 98.5%  ← 98.5% of number picks worked
```

**Save these numbers. This is your "before" photo.**

If baseline passes → go to Step 5.

---

## Step 5 — Run Load Test

```
k6 run load-test.js
```

Or with file output:
```
k6 run load-test.js --summary-export results/load-summary.json
```

**What it does:** Sends 100 fake players (60 solo + 25 public + 15 REST browsers) for 30 minutes. Ramps up slowly over the first 3 minutes.

**This is the important one.** It tells you if your game can handle real traffic.

**What a PASS looks like:**
```
✓ round_result_latency_ms p(95)=380ms   (target: <800ms)
✓ http_req_failed         0.3%          (target: <1%)
✓ connect_fail_rate       0.8%          (target: <3%)
✓ games_completed         78            (target: >50)
```

**What a FAIL looks like:**
```
✗ round_result_latency_ms p(95)=2100ms  (target: <800ms) ← too slow!
✗ http_req_failed         3.2%          (target: <1%) ← too many errors!
```

---

## How to read the final report (simple version)

```
http_req_duration...: avg=190ms  min=45ms  med=140ms  max=4.2s  p(90)=380ms  p(95)=520ms
```

| What | Meaning |
|------|---------|
| `avg` | Average response time |
| `p(95)` | 95% of requests were faster than this — **this is the most important number** |
| `p(99)` | 99% of requests were faster than this |
| `max` | The single slowest request (often an outlier, don't panic) |

```
http_req_failed: 0.50% ✓  ← means 0.5% of requests had errors (acceptable, target <1%)
```

```
round_result_latency_ms p(95)=420ms  ← 95% of round results arrived in under 420ms ✓
```

---

## Folder structure

```
load-tests/
├── utils/
│   └── socketio.js      ← Socket.IO protocol helper (don't touch)
├── smoke-test.js         ← TEST 1: 5 users, 2 min
├── baseline-test.js      ← TEST 2: 20 users, 15 min
├── load-test.js          ← TEST 3: 100 users, 30 min
├── results/              ← create this folder to save results
└── README.md             ← this file
```

Create the results folder:
```
mkdir results
```

---

## Running against a different URL

```
k6 run --env BASE_URL=https://your-other-url.com smoke-test.js
```

---

## Quick reference

| Test | Command | Users | Time |
|------|---------|-------|------|
| Smoke | `k6 run smoke-test.js` | 5 | 2 min |
| Baseline | `k6 run baseline-test.js` | 20 | 15 min |
| Load | `k6 run load-test.js` | 100 | 30 min |

**Always run in order: Smoke → Baseline → Load**
