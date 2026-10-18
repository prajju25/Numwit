# Numwit — Complete Load Testing Strategy

> **Oct 2026:** the app now runs on Fly.io + Upstash + Neon. To actually run a load test, follow
> **[LOAD_TEST_RUNBOOK.md](LOAD_TEST_RUNBOOK.md)** (scripts: `load-tests/hn-*.js`). The analysis below still
> applies; the capacity numbers and Render-specific advice are from the June Render setup.

> **Role:** Senior Performance Test Engineer  
> **Production URL:** https://numwit.onrender.com/  
> **Stack:** Node.js/Express 5 + Socket.IO + Redis (Render) + PostgreSQL (Neon) + React 19  
> **Hosting:** Render.com — single instance, vertical scaling only  
> **Date:** 2026-06-16

---

## Table of Contents

1. [Architecture Performance Audit](#1-architecture-performance-audit)
2. [Critical User Flows & Request Distribution](#2-critical-user-flows--request-distribution)
3. [Complete Load Testing Strategy](#3-complete-load-testing-strategy)
4. [k6 Scripts](#4-k6-scripts)
5. [JMeter Test Plan Structure](#5-jmeter-test-plan-structure)
6. [Monitoring Dashboard Requirements](#6-monitoring-dashboard-requirements)
7. [Pass/Fail Criteria](#7-passfail-criteria)
8. [Bottleneck Analysis & Scaling Limits](#8-bottleneck-analysis--scaling-limits)
9. [Infrastructure Recommendations](#9-infrastructure-recommendations)

---

## 1. Architecture Performance Audit

### 1.1 Application Layer Bottlenecks

| Risk | Location | Description | Severity |
|------|----------|-------------|----------|
| **Event loop blocking** | `server/utils/gameManager.js → evaluateRound()` | Synchronous JS computation — trivial for 3–8 players but scales linearly. Non-blocking in practice up to ~1,000 concurrent rooms. | Low |
| **In-memory timer leaks** | `timerService.js`, `roomCleanup.js`, `pendingDisconnects` | All timers live in Node.js process memory. A restart loses all pending timers. 1,000 concurrent rooms = 1,000+ active `setTimeout` handles. | Medium |
| **In-memory rate limiter** | `server/utils/rateLimiter.js` | Per-socket Map — not shared across instances, grows unboundedly until socket disconnect clears it. | Medium |
| **Bot submission I/O** | `botService.scheduleBotSubmissions()` | Each bot fires a `send_number` handler (Redis read + write). 3 bots × N rooms = 3N Redis ops per round burst. | Medium |
| **Room accumulation without TTL cleanup** | Redis | Rooms that bypass the 5-min cleanup (server restart during timer) persist for the full 3600s TTL. | Medium |
| **Single Node.js process** | Render single instance | All WebSocket connections, game logic, timers, and HTTP requests share one event loop and one CPU core (or ~1 vCPU on Render). | High |
| **Render cold starts** | Render free tier | Free web services sleep after 15 minutes of inactivity — first connection after sleep takes 10–30 seconds. MUST use paid tier ($7/mo) for always-on. | Critical |

### 1.2 Database Layer Bottlenecks

| Risk | Location | Description | Severity |
|------|----------|-------------|----------|
| **Neon serverless cold start** | Postgres (Neon) | Neon databases scale to zero and have a ~500ms–2s cold start on first query after idle. Affects stats endpoints only (not game loop). | Medium |
| **No query result caching** | `/api/stats`, `/api/leaderboard` | Stats queries hit Postgres on every call. `/api/leaderboard` is a `findMany` with `orderBy` — unindexed sort on large dataset will slow down. | Medium |
| **Prisma connection pool** | `server/db/prismaClient.js` | Prisma's default pool is 5–10 connections. Neon free tier limits to 1 direct connection (use pooler URL). Pool exhaustion under load = hanging queries. | High |
| **`persistGameOver()` on every game end** | `server/socketHandlers/game.js` | Writes to 3–4 tables (User, SessionStat, Achievement, UserAchievement) in sequence per player. Under high concurrency this creates a write burst. | Medium |

### 1.3 Cache Layer Bottlenecks

| Risk | Location | Description | Severity |
|------|----------|-------------|----------|
| **Render Redis memory limit** | Redis (Render) | Render's free Redis plan is 25MB. Each room JSON is ~2–5KB. At 25MB: supports ~5,000–12,000 rooms (fine). But Render Redis also handles Socket.IO adapter pub/sub if enabled. | Medium |
| **Redis single-threaded write spikes** | `saveRoom()` called on every event | `send_number` → `saveRoom()` per submission. 100 concurrent rooms × 3 players × 1 submission = 300 Redis writes in a few seconds. | Medium |
| **No read-through caching on room fetch** | `getRoomById()` in every handler | Every socket event handler reads the full room JSON from Redis. At 1,000 concurrent events/sec, that is 1,000 Redis GET ops/sec. | Medium |
| **Redis connection timeout on idle** | Render Redis | Render Redis closes idle connections after a timeout. The client will auto-reconnect but a brief connection error spike appears in logs. | Low |

### 1.4 Network Layer Bottlenecks

| Risk | Location | Description | Severity |
|------|----------|-------------|----------|
| **WebSocket connection overhead** | Socket.IO handshake | Each connection makes 1 HTTP polling GET + 1 POST, then upgrades to WebSocket. Under high connection-churn (many join/leave cycles) this adds HTTP overhead. | Medium |
| **Render egress bandwidth** | Socket.IO room broadcasts | `io.to(roomId).emit()` sends to all room members. At 8 players × 5KB payload = 40KB per broadcast. 100 rooms × 5 round_results/game = 20MB per game cycle. | Low |
| **No CDN for static assets** | React build served from Express | `client/dist` is served by the same Node.js process that handles game logic. Static asset requests compete with WebSocket frames for the event loop. | Medium |
| **TLS termination on Render** | HTTPS/WSS | Render terminates TLS at its edge proxy. Extra 1–3ms RTT per message — acceptable but adds up under sustained load. | Low |

### 1.5 External API Integrations

| Integration | Risk |
|-------------|------|
| **Neon Postgres** | Latency spikes under connection burst; pooler URL required |
| **Render Redis** | Memory ceiling at 25MB free; connection reset on idle |
| **No third-party APIs** | No Stripe, no CDN, no push notifications — low external risk |

---

## 2. Critical User Flows & Request Distribution

### 2.1 User Journey State Machine

```
[Landing]
    │── GET /  (static HTML)
    │── GET /api/stats  (optional live counter poll)
    ▼
[Login/Name Entry]  ← localStorage, no server call
    ▼
[Room Type Selection]
    ├── Solo:    join_room(roomType=solo)   → game starts immediately
    ├── Public:  join_room(roomType=public) → wait or fill with bots
    └── Private: join_room(roomId=xxx)      → waiting room
    ▼
[Waiting Room]
    │── room_update (server→client, on each player join)
    │── chat_send / chat_message (optional)
    │── start_game (host only, private) or auto-start (public/solo)
    ▼
[Game Loop — repeats per round]
    │── next_round (server→all)
    │── send_number (client→server) — THE hottest path
    │── waiting_for_players (server→all, per submission)
    │── round_result / round_void (server→all)
    │── player_eliminated (server→all, conditional)
    │── send_emote (optional, client→server)
    ▼
[Game Over]
    │── game_over (server→all)
    │── restart_game (host only) OR leave_room
    └── submit_feedback (optional)
```

### 2.2 Request Distribution (expected production mix)

| Flow | % of traffic | Notes |
|------|-------------|-------|
| REST: health + stats + leaderboard | 15% | Polling (10s interval on landing page) |
| Socket.IO handshake (join) | 10% | Spiky during session start |
| Socket: join_room + room lifecycle | 15% | Per session |
| Socket: send_number per round | 40% | **Hottest path** — multiple per game |
| Socket: chat/emote events | 10% | Social layer, optional |
| Socket: disconnect / grace period | 5% | Reconnect churn |
| REST: admin endpoints | 5% | Internal only |

### 2.3 Think Times

| Action | Min | Max | Notes |
|--------|-----|-----|-------|
| Name entry → join | 2s | 15s | One-time only |
| Waiting room idle | 10s | 120s | Depends on players joining |
| Round decision (pick number) | 3s | 25s | Core UX; timer is 25s default |
| Between rounds (result overlay) | 5s | 10s | Auto-advance after 7s |
| Game over → restart/leave | 2s | 30s | User decides |
| Emote spamming | 0.5s | 2s | Rate-limited to 1/2s |

---

## 3. Complete Load Testing Strategy

### 3.1 Capacity Assumptions (Render Starter Instance)

| Resource | Estimated Limit |
|----------|----------------|
| RAM | 512MB–1GB |
| CPU | ~1 vCPU shared |
| Max WebSocket connections (Node.js) | ~5,000–10,000 (memory-bound) |
| Max practical concurrent game rooms | ~300–500 |
| Max concurrent users at acceptable P95 | **~150–250** |
| Redis (Render free) memory | 25MB |
| Neon Postgres free connections | 10 via pooler |

### 3.2 Test Suite Overview

| Test Type | Users | Duration | Goal |
|-----------|-------|----------|------|
| Smoke | 5 | 2 min | Verify system works end-to-end |
| Baseline | 20 | 15 min | Establish performance baseline |
| Load | 100 | 30 min | Expected peak production load |
| Stress | 250→500 | 20 min | Find degradation point |
| Spike | 20→200→20 | 10 min | Recovery after sudden burst |
| Soak | 40 | 24 hours | Memory leaks, timer drift, Redis TTL |
| Breakpoint | 0→∞ | Until failure | Find absolute ceiling |

---

### 3.3 Smoke Test

**Goal:** Confirm the deployment is live and all critical paths return expected responses.

**Configuration:**
```
Virtual Users: 5
Ramp-up: 0s (immediate)
Duration: 2 minutes
Ramp-down: 0s
Think time: 1s between actions
```

**Scenarios:**
1. GET /api/health → expect 200, `{"status":"ok"}`
2. GET /api/stats → expect 200, JSON with numeric fields
3. Socket.IO connect → join_room (solo) → receive next_round → send_number → receive round_result → disconnect
4. GET /api/leaderboard → expect 200, array

**Pass criteria:** 0 errors, all responses within 2s

---

### 3.4 Baseline Test

**Goal:** Establish a clean performance baseline under low load with no resource contention.

**Configuration:**
```
Virtual Users: 20
Ramp-up: 60s (2 users added every 6s)
Steady state: 10 minutes
Ramp-down: 60s
Think time: Realistic (see 2.3)
```

**Scenario Mix:**
- 12 VUs: Full game session (join solo, play 3+ rounds)
- 4 VUs: Join public room, wait, play
- 4 VUs: REST API polling (/api/health, /api/stats every 10s)

**Metrics to capture (this becomes your baseline reference):**
- Socket.IO handshake P50/P95/P99
- send_number → round_result latency P50/P95
- Redis ops/sec, Redis latency
- Node.js heap usage, CPU%
- Error rate

---

### 3.5 Load Test

**Goal:** Validate system behavior at expected peak production load.

**Configuration:**
```
Virtual Users: 100
Ramp-up: 3 minutes (staged):
  0:00 → 0:30  ramp 0→25 users
  0:30 → 1:30  ramp 25→75 users
  1:30 → 3:00  ramp 75→100 users
Steady state: 25 minutes
Ramp-down: 2 minutes
Think time: Realistic (see 2.3)
```

**Scenario Mix (100 VUs):**
- 50 VUs: Solo game sessions (continuous loop)
- 20 VUs: Public game sessions (matchmaking + bot fill)
- 15 VUs: Private rooms (2–4 players each)
- 15 VUs: REST API consumers (stats, leaderboard, health polling)

**Expected bottleneck at this tier:** Redis write spikes during `send_number` bursts when many rooms end a round simultaneously.

---

### 3.6 Stress Test

**Goal:** Determine at what load the system starts failing SLAs and how it degrades.

**Configuration:**
```
Stage 1: 0→100 VUs over 2 minutes (replicates Load Test)
Stage 2: 100→200 VUs over 3 minutes
Stage 3: 200→350 VUs over 3 minutes
Stage 4: 350→500 VUs over 3 minutes (or until error rate > 5%)
Steady state: 5 minutes at final achieved load
Ramp-down: 3 minutes
Think time: Compressed (50% of baseline) to maximize pressure
```

**What to watch:**
- When does P95 response time cross 1s?
- When does error rate cross 1%? 5%?
- Does the Node.js heap grow unboundedly (leak indicator)?
- Does Redis start returning errors?
- At what point does Render throttle CPU?

**Expected failure mode:** Node.js event loop lag increases (setTimeout delays, WebSocket backpressure), then Redis connection queue backs up, then Socket.IO emits start dropping.

---

### 3.7 Spike Test

**Goal:** Validate recovery from a sudden traffic spike (e.g., viral post / social share).

**Configuration:**
```
Phase 1 — Normal:  20 VUs for 2 minutes
Phase 2 — Spike:   Instant ramp to 200 VUs, hold 3 minutes
Phase 3 — Recovery: Drop back to 20 VUs, hold 3 minutes
Think time: Minimal (1s) to amplify spike effect
```

**Recovery criteria:**
- Error rate returns to baseline within 60s of spike ending
- P95 latency returns to baseline within 120s
- No connection state corruption (rooms should still work)
- Disconnect grace period (60s) timers must not avalanche

**Expected failure mode during spike:** WebSocket upgrade queue backs up → connection timeouts → users see socket error → rapid reconnect storm → amplifies load.

---

### 3.8 Soak Test (24+ Hours)

**Goal:** Detect memory leaks, timer accumulation, Redis TTL issues, and connection state drift.

**Configuration:**
```
Virtual Users: 40 (sustainable, well below limit)
Ramp-up: 5 minutes
Duration: 24 hours minimum (48 hours preferred)
Think time: Realistic + randomized ±30%
Session churn: Each VU starts a new game session after completing one
```

**Critical checks (automated alerts at these thresholds):**

| Metric | Alert threshold | Reason |
|--------|----------------|--------|
| Node.js heap | > 400MB and growing | Memory leak in pendingDisconnects, botService, timerService |
| Redis key count | Unbounded growth | Rooms not being cleaned up despite 3600s TTL |
| Active timer count | Proportional to rooms (healthy) or growing faster | Timer leak in roomCleanup.js or timerService.js |
| WebSocket connections | > (active VUs × 1.5) | Zombie sockets not being cleared on disconnect |
| Postgres connections (Neon) | > 8 (approaching pool limit of 10) | Connection leak in Prisma |
| Error rate | > 0.5% sustained | Systemic issue, not noise |
| Redis `pendingDisconnects` map | Growing | Grace period timers not clearing |

**Soak test monitoring checkpoints:**
- T+0h: Baseline snapshot of all metrics
- T+1h: First check — heap should plateau
- T+4h: Confirm no Redis key leaks
- T+8h: Mid-point assessment
- T+12h: Neon Postgres idle timeout check (connections reset?)
- T+24h: Final comparison against T+0 snapshot

**Known leak risks based on code audit:**
1. `pendingDisconnects` Map in `lobby.js` — if a device disconnects without a device ID, no grace timer is set and `socketToDevice`/`socketToRoom` entries clean up. But if a device disconnects during a server edge case and the grace timer never fires, the entry persists until the 60s timer.
2. `botService` internal state (`_bots`, `_submissions`) — if `removeRoom()` is not called on every cleanup path.
3. `timerService._timers` Map — if `clearTimer()` is not called on every game end path.

---

### 3.9 Breakpoint Test

**Goal:** Find the absolute ceiling — the user count at which the system becomes unusable.

**Configuration:**
```
Ramp strategy: +25 VUs every 2 minutes, no ceiling
Starting point: 50 VUs (warm start)
Stop condition: Error rate > 10% OR P99 > 10s OR complete system failure
Maximum: 1,000 VUs (above this, Render will likely OOM kill the process)
Think time: 0.5s (aggressive)
```

**Record at each step:**
- VU count when P95 > 500ms
- VU count when P95 > 2000ms
- VU count when error rate crosses 1%, 5%, 10%
- VU count at which Node.js process OOM-kills or Render restarts it
- VU count at which Redis returns errors

---

## 4. k6 Scripts

### 4.1 Socket.IO Protocol Implementation Helper

```javascript
// utils/socketio.js
// Socket.IO 4.x + Engine.IO 4.x wire protocol implementation for k6

import { sleep } from 'k6';
import http from 'k6/http';
import { WebSocket } from 'k6/experimental/websockets';
import { check } from 'k6';

const EIO_OPEN    = '0';
const EIO_CLOSE   = '1';
const EIO_PING    = '2';
const EIO_PONG    = '3';
const EIO_MESSAGE = '4';
const EIO_UPGRADE = '5';
const EIO_NOOP    = '6';

const SIO_CONNECT    = '0';
const SIO_DISCONNECT = '1';
const SIO_EVENT      = '2';
const SIO_ACK        = '3';
const SIO_ERROR      = '4';

// Encode a Socket.IO event frame
// Returns string like: 42["event_name",{...data}]
export function encodeEvent(eventName, data) {
  return EIO_MESSAGE + SIO_EVENT + JSON.stringify([eventName, data]);
}

// Parse an incoming Socket.IO frame
// Returns { type, event, data } or null if not parseable
export function parseFrame(raw) {
  if (!raw || raw.length < 2) return null;
  const eioType = raw[0];
  if (eioType !== EIO_MESSAGE) return { type: eioType, event: null, data: null };
  const sioType = raw[1];
  if (sioType === SIO_EVENT || sioType === SIO_ACK) {
    try {
      const payload = JSON.parse(raw.slice(2));
      return { type: sioType, event: payload[0], data: payload[1] };
    } catch (_) {
      return null;
    }
  }
  if (sioType === SIO_CONNECT) return { type: 'connected', event: null, data: null };
  if (sioType === SIO_DISCONNECT) return { type: 'disconnected', event: null, data: null };
  return { type: sioType, event: null, data: null };
}

// Perform Socket.IO handshake via HTTP polling, get session ID
// Returns { sid, pingInterval, pingTimeout } or null on failure
export function handshake(baseUrl) {
  const pollUrl = `${baseUrl}/socket.io/?EIO=4&transport=polling`;
  const res = http.get(pollUrl, { timeout: '10s' });

  if (!check(res, { 'polling handshake 200': (r) => r.status === 200 })) {
    return null;
  }

  // Response looks like: 97:0{"sid":"xxx","upgrades":["websocket"],...}
  // Strip length prefix and EIO frame type byte
  let body = res.body;
  const colonIdx = body.indexOf(':');
  if (colonIdx > -1) body = body.slice(colonIdx + 1);
  if (body[0] === EIO_OPEN) body = body.slice(1);

  try {
    const info = JSON.parse(body);
    return info; // { sid, upgrades, pingInterval, pingTimeout }
  } catch (_) {
    return null;
  }
}

// Send Socket.IO CONNECT packet via polling (required before WebSocket upgrade)
export function sendConnectPolling(baseUrl, sid) {
  const pollUrl = `${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}`;
  // Engine.IO message (4) + Socket.IO connect (0)
  const body = EIO_MESSAGE + SIO_CONNECT;
  return http.post(pollUrl, body, {
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    timeout: '5s',
  });
}
```

---

### 4.2 Smoke Test Script

```javascript
// smoke-test.js
import { check, sleep } from 'k6';
import http from 'k6/http';
import { WebSocket } from 'k6/experimental/websockets';
import { handshake, sendConnectPolling, encodeEvent, parseFrame } from './utils/socketio.js';

const BASE_URL = __ENV.BASE_URL || 'https://numwit.onrender.com';
const WS_URL   = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');

export const options = {
  vus: 5,
  duration: '2m',
  thresholds: {
    http_req_failed:          ['rate<0.01'],
    http_req_duration:        ['p(95)<2000'],
    'http_req_duration{api:health}': ['p(95)<500'],
    'http_req_duration{api:stats}':  ['p(95)<1000'],
  },
};

export default function () {
  // ── REST API checks ────────────────────────────────────────────────────────
  const health = http.get(`${BASE_URL}/api/health`, {
    tags: { api: 'health' },
  });
  check(health, {
    'health 200':      (r) => r.status === 200,
    'health status ok': (r) => {
      try { return JSON.parse(r.body).status === 'ok'; } catch(_) { return false; }
    },
  });

  const stats = http.get(`${BASE_URL}/api/stats`, {
    tags: { api: 'stats' },
  });
  check(stats, {
    'stats 200': (r) => r.status === 200,
  });

  sleep(1);

  // ── Socket.IO: Full solo game session ────────────────────────────────────
  const info = handshake(BASE_URL);
  if (!info) { return; }
  sendConnectPolling(BASE_URL, info.sid);

  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket&sid=${info.sid}`;

  const deviceId = `k6-smoke-${__VU}-${Date.now()}`;
  const user = { name: `TestUser${__VU}`, avatar: '🤖' };

  let gameStarted   = false;
  let roundReceived = false;
  let submitted     = false;
  let resultReceived = false;

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    // Engine.IO probe handshake
    ws.send('2probe');
  };

  ws.onmessage = (e) => {
    const msg = e.data;

    // Probe handshake
    if (msg === '3probe') { ws.send('5'); return; } // confirm upgrade

    const frame = parseFrame(msg);
    if (!frame) return;

    if (frame.type === 'connected') {
      // Join a solo game immediately
      ws.send(encodeEvent('join_room', {
        roomId: null,
        user: { ...user, socketId: null },
        roomType: 'solo',
        deviceId,
      }));
    }

    if (frame.event === 'next_round' && !submitted) {
      roundReceived = true;
      // Submit a number immediately
      ws.send(encodeEvent('send_number', {
        roomId: frame.data.roomId || 'unknown',
        no: 42,
      }));
      submitted = true;
    }

    if (frame.event === 'round_result') {
      resultReceived = true;
    }

    if (frame.event === 'game_over' || frame.event === 'room_deleted') {
      ws.close();
    }

    // Ping/pong keepalive
    if (msg === '2') { ws.send('3'); }
  };

  ws.onerror = (e) => {
    console.error(`WS error VU${__VU}: ${e.error}`);
  };

  // Wait max 30s for game flow
  const deadline = Date.now() + 30_000;
  while (ws.readyState !== WebSocket.CLOSED && Date.now() < deadline) {
    sleep(0.1);
  }

  check(null, {
    'round was received': () => roundReceived,
    'number was submitted': () => submitted,
    'result was received': () => resultReceived,
  });

  sleep(1);
}
```

---

### 4.3 Load Test Script

```javascript
// load-test.js
// 100 VUs — mixed scenario load test

import { check, sleep, group } from 'k6';
import http from 'k6/http';
import { WebSocket } from 'k6/experimental/websockets';
import { Trend, Counter, Rate } from 'k6/metrics';
import { handshake, sendConnectPolling, encodeEvent, parseFrame } from './utils/socketio.js';

const BASE_URL = __ENV.BASE_URL || 'https://numwit.onrender.com';
const WS_URL   = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');

// Custom metrics
const roundLatency    = new Trend('round_result_latency_ms', true);
const gameCompletions = new Counter('game_completions');
const connectionErrors = new Rate('connection_error_rate');
const submitSuccessRate = new Rate('submit_success_rate');

export const options = {
  scenarios: {
    // 50 VUs playing solo games
    solo_games: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30m',
      exec: 'soloGame',
    },
    // 20 VUs doing REST polling (landing page behavior)
    rest_pollers: {
      executor: 'constant-vus',
      vus: 20,
      duration: '30m',
      exec: 'restPoller',
    },
    // 30 VUs in public matchmaking rooms
    public_games: {
      executor: 'constant-vus',
      vus: 30,
      duration: '30m',
      exec: 'publicGame',
    },
  },
  thresholds: {
    // P95 latency SLAs
    'http_req_duration{api:health}':       ['p(95)<500'],
    'http_req_duration{api:stats}':        ['p(95)<1000'],
    'http_req_duration{api:leaderboard}':  ['p(95)<2000'],
    'round_result_latency_ms':             ['p(95)<500', 'p(99)<1000'],

    // Reliability SLAs
    http_req_failed:      ['rate<0.01'],
    connection_error_rate: ['rate<0.02'],
    submit_success_rate:   ['rate>0.98'],
    game_completions:      ['count>100'], // at least 100 full game completions in 30 min
  },
};

// ── Scenario: REST API polling ───────────────────────────────────────────────
export function restPoller() {
  group('rest_api', () => {
    http.get(`${BASE_URL}/api/health`, { tags: { api: 'health' } });
    sleep(5);
    http.get(`${BASE_URL}/api/stats`, { tags: { api: 'stats' } });
    sleep(5);
  });
  if (Math.random() < 0.1) {
    // 10% of pollers also hit leaderboard
    http.get(`${BASE_URL}/api/leaderboard`, { tags: { api: 'leaderboard' } });
  }
  sleep(10 + Math.random() * 5);
}

// ── Scenario: Solo game ──────────────────────────────────────────────────────
export function soloGame() {
  const deviceId = `k6-solo-${__VU}-${Date.now()}`;
  const userName  = `Player${__VU}`;
  const user      = { name: userName, avatar: '🎮' };

  const info = handshake(BASE_URL);
  if (!info) {
    connectionErrors.add(1);
    sleep(5);
    return;
  }
  connectionErrors.add(0);
  sendConnectPolling(BASE_URL, info.sid);

  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket&sid=${info.sid}`;

  let currentRoomId  = null;
  let roundCount     = 0;
  let sendTimestamp  = null;
  let submitted      = false;
  let sessionDone    = false;
  let connected      = false;

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => { ws.send('2probe'); };

  ws.onmessage = (e) => {
    const msg = e.data;
    if (msg === '3probe') { ws.send('5'); return; }
    if (msg === '2') { ws.send('3'); return; }  // Engine.IO ping/pong

    const frame = parseFrame(msg);
    if (!frame) return;

    if (frame.type === 'connected' && !connected) {
      connected = true;
      ws.send(encodeEvent('join_room', {
        roomId: null,
        user: { ...user, socketId: null },
        roomType: 'solo',
        deviceId,
      }));
    }

    if (frame.event === 'room_update' && frame.data) {
      currentRoomId = frame.data.id;
    }

    if (frame.event === 'next_round' && !submitted) {
      roundCount++;
      submitted = true;
      sendTimestamp = Date.now();

      // Human-like think time (3–15 seconds to "decide")
      const thinkTime = 3 + Math.random() * 12;
      sleep(thinkTime);

      // Pick a number 10–90 (simulate real strategy)
      const no = 10 + Math.floor(Math.random() * 80);
      ws.send(encodeEvent('send_number', { roomId: currentRoomId, no }));
    }

    if (frame.event === 'round_result') {
      if (sendTimestamp) {
        roundLatency.add(Date.now() - sendTimestamp);
        sendTimestamp = null;
      }
      submitted = false; // ready for next round
      submitSuccessRate.add(1);
    }

    if (frame.event === 'round_void') {
      submitted = false;
    }

    if (frame.event === 'game_over' || frame.event === 'room_deleted') {
      gameCompletions.add(1);
      sessionDone = true;
      ws.close();
    }
  };

  ws.onerror = () => {
    connectionErrors.add(1);
    sessionDone = true;
  };

  // Wait up to 3 minutes per game session (solo game ~5–7 rounds × 25s)
  const deadline = Date.now() + 3 * 60_000;
  while (!sessionDone && Date.now() < deadline) {
    sleep(0.5);
  }

  if (!sessionDone) ws.close();

  // Cool-down between sessions
  sleep(2 + Math.random() * 3);
}

// ── Scenario: Public matchmaking ─────────────────────────────────────────────
export function publicGame() {
  const deviceId = `k6-pub-${__VU}-${Date.now()}`;
  const user = { name: `PubPlayer${__VU}`, avatar: '🌍' };

  const info = handshake(BASE_URL);
  if (!info) {
    connectionErrors.add(1);
    sleep(10);
    return;
  }
  connectionErrors.add(0);
  sendConnectPolling(BASE_URL, info.sid);

  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket&sid=${info.sid}`;

  let currentRoomId = null;
  let submitted = false;
  let sessionDone = false;
  let connected = false;

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => { ws.send('2probe'); };

  ws.onmessage = (e) => {
    const msg = e.data;
    if (msg === '3probe') { ws.send('5'); return; }
    if (msg === '2') { ws.send('3'); return; }

    const frame = parseFrame(msg);
    if (!frame) return;

    if (frame.type === 'connected' && !connected) {
      connected = true;
      ws.send(encodeEvent('join_room', {
        roomId: null,
        user: { ...user, socketId: null },
        roomType: 'public',
        deviceId,
      }));
    }

    if (frame.event === 'room_update' && frame.data) {
      currentRoomId = frame.data.id;
    }

    if (frame.event === 'next_round' && !submitted) {
      submitted = true;
      const thinkTime = 3 + Math.random() * 20;
      sleep(thinkTime);
      const no = 10 + Math.floor(Math.random() * 80);
      ws.send(encodeEvent('send_number', { roomId: currentRoomId, no }));
    }

    if (frame.event === 'round_result' || frame.event === 'round_void') {
      submitted = false;
      submitSuccessRate.add(frame.event === 'round_result' ? 1 : 0);
    }

    if (frame.event === 'game_over' || frame.event === 'room_deleted') {
      gameCompletions.add(1);
      sessionDone = true;
      ws.close();
    }
  };

  ws.onerror = () => { connectionErrors.add(1); sessionDone = true; };

  const deadline = Date.now() + 5 * 60_000; // public games take longer (wait + play)
  while (!sessionDone && Date.now() < deadline) {
    sleep(0.5);
  }
  if (!sessionDone) ws.close();
  sleep(5 + Math.random() * 5);
}
```

---

### 4.4 Stress Test Script

```javascript
// stress-test.js
import { check, sleep } from 'k6';
import { WebSocket } from 'k6/experimental/websockets';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';
import { handshake, sendConnectPolling, encodeEvent, parseFrame } from './utils/socketio.js';

const BASE_URL = __ENV.BASE_URL || 'https://numwit.onrender.com';
const WS_URL   = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');

const connectionErrors = new Rate('stress_connection_errors');
const roundLatency     = new Trend('stress_round_latency_ms', true);

export const options = {
  stages: [
    { duration: '2m',  target: 100  }, // Ramp to load test level
    { duration: '3m',  target: 200  }, // Push to 2x
    { duration: '3m',  target: 350  }, // Push to 3.5x
    { duration: '3m',  target: 500  }, // Push to 5x (or until failure)
    { duration: '5m',  target: 500  }, // Hold at maximum achieved
    { duration: '3m',  target: 0    }, // Ramp down
  ],
  thresholds: {
    http_req_failed:          ['rate<0.10'], // Fail at 10% error (stress tolerates more)
    'stress_round_latency_ms': ['p(99)<5000'], // 5s max under stress
    stress_connection_errors:  ['rate<0.15'],
  },
};

export default function () {
  const deviceId = `k6-stress-${__VU}-${Date.now()}`;
  const user = { name: `StressUser${__VU}`, avatar: '⚡' };

  const info = handshake(BASE_URL);
  if (!info) {
    connectionErrors.add(1);
    sleep(2);
    return;
  }
  connectionErrors.add(0);
  sendConnectPolling(BASE_URL, info.sid);

  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket&sid=${info.sid}`;

  let currentRoomId = null;
  let submitted = false;
  let done = false;
  let connected = false;
  let roundStart = null;

  const ws = new WebSocket(wsUrl);
  ws.onopen = () => { ws.send('2probe'); };

  ws.onmessage = (e) => {
    const msg = e.data;
    if (msg === '3probe') { ws.send('5'); return; }
    if (msg === '2') { ws.send('3'); return; }

    const frame = parseFrame(msg);
    if (!frame) return;

    if (frame.type === 'connected' && !connected) {
      connected = true;
      ws.send(encodeEvent('join_room', {
        roomId: null, user, roomType: 'solo', deviceId,
      }));
    }

    if (frame.event === 'room_update' && frame.data) {
      currentRoomId = frame.data.id;
    }

    if (frame.event === 'next_round' && !submitted) {
      roundStart = Date.now();
      submitted = true;
      // Compressed think time under stress (0.5–3s)
      sleep(0.5 + Math.random() * 2.5);
      ws.send(encodeEvent('send_number', {
        roomId: currentRoomId,
        no: 10 + Math.floor(Math.random() * 80),
      }));
    }

    if (frame.event === 'round_result') {
      if (roundStart) roundLatency.add(Date.now() - roundStart);
      roundStart = null;
      submitted = false;
    }

    if (frame.event === 'round_void') { submitted = false; }

    if (frame.event === 'game_over' || frame.event === 'room_deleted') {
      done = true;
      ws.close();
    }
  };

  ws.onerror = () => { connectionErrors.add(1); done = true; };

  const deadline = Date.now() + 2 * 60_000;
  while (!done && Date.now() < deadline) { sleep(0.2); }
  if (!done) ws.close();
  sleep(1);
}
```

---

### 4.5 Spike Test Script

```javascript
// spike-test.js
import { sleep } from 'k6';
import { WebSocket } from 'k6/experimental/websockets';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';
import { handshake, sendConnectPolling, encodeEvent, parseFrame } from './utils/socketio.js';

const BASE_URL = __ENV.BASE_URL || 'https://numwit.onrender.com';
const WS_URL   = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');

const spikeLag   = new Trend('spike_recovery_latency_ms', true);
const spikeErrors = new Rate('spike_error_rate');

export const options = {
  stages: [
    { duration: '2m', target: 20  }, // Baseline
    { duration: '10s', target: 200 }, // SPIKE (instant)
    { duration: '3m', target: 200  }, // Hold spike
    { duration: '10s', target: 20  }, // Drop back (instant)
    { duration: '3m', target: 20  }, // Recovery observation
  ],
  thresholds: {
    spike_error_rate:           ['rate<0.10'],
    'spike_recovery_latency_ms': ['p(95)<3000'],
    http_req_failed:             ['rate<0.10'],
  },
};

export default function () {
  const deviceId = `k6-spike-${__VU}-${Date.now()}`;
  const user = { name: `Spike${__VU}`, avatar: '⚡' };

  const t0 = Date.now();
  const info = handshake(BASE_URL);
  const handshakeDuration = Date.now() - t0;

  if (!info) {
    spikeErrors.add(1);
    sleep(3);
    return;
  }
  spikeErrors.add(0);
  sendConnectPolling(BASE_URL, info.sid);

  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket&sid=${info.sid}`;

  let currentRoomId = null;
  let submitted = false;
  let done = false;
  let connected = false;

  const ws = new WebSocket(wsUrl);
  ws.onopen = () => { ws.send('2probe'); };

  ws.onmessage = (e) => {
    const msg = e.data;
    if (msg === '3probe') { ws.send('5'); return; }
    if (msg === '2') { ws.send('3'); return; }

    const frame = parseFrame(msg);
    if (!frame) return;

    if (frame.type === 'connected' && !connected) {
      connected = true;
      // Record how long from connection start to Socket.IO ready
      spikeLag.add(Date.now() - t0);
      ws.send(encodeEvent('join_room', {
        roomId: null, user, roomType: 'solo', deviceId,
      }));
    }

    if (frame.event === 'room_update' && frame.data) currentRoomId = frame.data.id;
    if (frame.event === 'next_round' && !submitted) {
      submitted = true;
      sleep(2 + Math.random() * 5);
      ws.send(encodeEvent('send_number', {
        roomId: currentRoomId,
        no: 10 + Math.floor(Math.random() * 80),
      }));
    }
    if (frame.event === 'round_result' || frame.event === 'round_void') submitted = false;
    if (frame.event === 'game_over' || frame.event === 'room_deleted') {
      done = true;
      ws.close();
    }
  };

  ws.onerror = () => { spikeErrors.add(1); done = true; };

  const deadline = Date.now() + 2 * 60_000;
  while (!done && Date.now() < deadline) { sleep(0.3); }
  if (!done) ws.close();
  sleep(1);
}
```

---

### 4.6 Soak Test Script

```javascript
// soak-test.js
import { sleep } from 'k6';
import { WebSocket } from 'k6/experimental/websockets';
import http from 'k6/http';
import { Counter, Gauge, Rate, Trend } from 'k6/metrics';
import { handshake, sendConnectPolling, encodeEvent, parseFrame } from './utils/socketio.js';

const BASE_URL = __ENV.BASE_URL || 'https://numwit.onrender.com';
const WS_URL   = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');

const gameCompletions  = new Counter('soak_game_completions');
const roundLatency     = new Trend('soak_round_latency_ms', true);
const connectionErrors = new Rate('soak_connection_errors');
const healthChecks     = new Rate('soak_health_ok');

export const options = {
  vus: 40,
  duration: '24h',
  thresholds: {
    // Relaxed for soak — looking for trends, not instant failures
    soak_connection_errors: ['rate<0.05'],
    soak_health_ok:         ['rate>0.99'],
    'soak_round_latency_ms': ['p(95)<2000'],
    http_req_failed:         ['rate<0.02'],
  },
};

export default function () {
  // Every VU alternates between game sessions and REST checks
  if (__VU % 5 === 0) {
    // 20% of VUs: pure REST health checkers
    while (true) {
      const res = http.get(`${BASE_URL}/api/health`);
      healthChecks.add(res.status === 200 ? 1 : 0);
      sleep(30);
    }
  }

  // 80% of VUs: continuous solo game sessions
  while (true) {
    playSoloGame();
    sleep(5 + Math.random() * 10); // cool-down between sessions
  }
}

function playSoloGame() {
  const deviceId = `k6-soak-${__VU}-${Date.now()}`;
  const user = { name: `SoakUser${__VU}`, avatar: '🌊' };

  const info = handshake(BASE_URL);
  if (!info) {
    connectionErrors.add(1);
    sleep(10);
    return;
  }
  connectionErrors.add(0);
  sendConnectPolling(BASE_URL, info.sid);

  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket&sid=${info.sid}`;

  let currentRoomId = null;
  let submitted = false;
  let done = false;
  let connected = false;
  let roundStart = null;

  const ws = new WebSocket(wsUrl);
  ws.onopen = () => { ws.send('2probe'); };

  ws.onmessage = (e) => {
    const msg = e.data;
    if (msg === '3probe') { ws.send('5'); return; }
    if (msg === '2') { ws.send('3'); return; }

    const frame = parseFrame(msg);
    if (!frame) return;

    if (frame.type === 'connected' && !connected) {
      connected = true;
      ws.send(encodeEvent('join_room', {
        roomId: null, user, roomType: 'solo', deviceId,
      }));
    }

    if (frame.event === 'room_update' && frame.data) currentRoomId = frame.data.id;

    if (frame.event === 'next_round' && !submitted) {
      roundStart = Date.now();
      submitted = true;
      // Realistic think time
      sleep(4 + Math.random() * 15);
      ws.send(encodeEvent('send_number', {
        roomId: currentRoomId,
        no: 5 + Math.floor(Math.random() * 90),
      }));
    }

    if (frame.event === 'round_result') {
      if (roundStart) { roundLatency.add(Date.now() - roundStart); roundStart = null; }
      submitted = false;
    }

    if (frame.event === 'round_void') { submitted = false; }

    if (frame.event === 'game_over' || frame.event === 'room_deleted') {
      gameCompletions.add(1);
      done = true;
      ws.close();
    }
  };

  ws.onerror = () => { connectionErrors.add(1); done = true; };

  // Max 5 minutes per game session
  const deadline = Date.now() + 5 * 60_000;
  while (!done && Date.now() < deadline) { sleep(0.5); }
  if (!done) ws.close();
}
```

---

### 4.7 Running the Tests

```bash
# Install k6 (macOS)
brew install k6

# Install k6 (Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Run smoke test
k6 run --env BASE_URL=https://numwit.onrender.com smoke-test.js

# Run load test with JSON output for Grafana
k6 run --env BASE_URL=https://numwit.onrender.com \
  --out json=results/load-test-$(date +%Y%m%d-%H%M%S).json \
  load-test.js

# Run stress test
k6 run --env BASE_URL=https://numwit.onrender.com stress-test.js

# Run spike test
k6 run --env BASE_URL=https://numwit.onrender.com spike-test.js

# Run soak test (24h) — run in tmux or screen
tmux new -s soak
k6 run --env BASE_URL=https://numwit.onrender.com \
  --out json=results/soak-$(date +%Y%m%d).ndjson \
  soak-test.js

# Stream results to k6 Cloud (if using Grafana Cloud k6)
K6_CLOUD_TOKEN=your-token k6 cloud --env BASE_URL=https://numwit.onrender.com load-test.js
```

---

## 5. JMeter Test Plan Structure

JMeter requires the **WebSocket Sampler** plugin for Socket.IO. Install via: *Tools → Plugin Manager → WebSocket Samplers by Peter Doornbosch*

### 5.1 Test Plan Hierarchy

```
Test Plan: Numwit Load Test
│
├── Thread Group: REST API (15% of load)
│   ├── HTTP Request Defaults (Server: numwit.onrender.com, Port: 443, Protocol: https)
│   ├── HTTP Header Manager (Content-Type: application/json)
│   ├── GET /api/health
│   │   └── Response Assertion: Contains "ok"
│   ├── Think Time: Uniform Random Timer (5000–15000ms)
│   ├── GET /api/stats
│   │   └── JSON Extractor: activePlayers → ${activePlayers}
│   └── Think Time: Uniform Random Timer (8000–12000ms)
│
├── Thread Group: Solo Game Session (50% of load)
│   ├── Number of Threads: ${VU_COUNT}
│   ├── Ramp-up: ${RAMP_UP_SECONDS}
│   ├── Loop Count: -1 (infinite during test)
│   │
│   ├── HTTP Request: Socket.IO Polling Handshake
│   │   ├── Method: GET
│   │   ├── Path: /socket.io/?EIO=4&transport=polling
│   │   └── JSON Extractor: $.sid → ${sid}
│   │
│   ├── HTTP Request: Socket.IO Connect
│   │   ├── Method: POST
│   │   ├── Path: /socket.io/?EIO=4&transport=polling&sid=${sid}
│   │   └── Body: 40
│   │
│   ├── WebSocket Open Connection
│   │   └── URL: wss://numwit.onrender.com/socket.io/?EIO=4&transport=websocket&sid=${sid}
│   │
│   ├── WebSocket Single Write: Engine.IO probe
│   │   └── Data: 2probe
│   │
│   ├── WebSocket Single Read: Wait for probe response
│   │   └── Assert: Response data = "3probe"
│   │
│   ├── WebSocket Single Write: Upgrade confirm
│   │   └── Data: 5
│   │
│   ├── WebSocket Single Read: Socket.IO connected
│   │   └── Wait for: 40 (Socket.IO CONNECT)
│   │
│   ├── WebSocket Single Write: join_room
│   │   └── Data: 42["join_room",{"roomId":null,"user":{"name":"JMUser${__threadNum}","avatar":"🔧"},"roomType":"solo","deviceId":"jm-${__threadNum}-${__time}"}]
│   │
│   ├── While Controller: Game not over
│   │   ├── WebSocket Single Read: Wait for next_round
│   │   │   └── Timeout: 30000ms
│   │   │   └── JSON Extractor from frame payload
│   │   │
│   │   ├── Uniform Random Timer: Think time (3000–20000ms)
│   │   │
│   │   ├── JSR223 Sampler: Compute submission number
│   │   │   └── Script: vars.put("pick", String.valueOf(10 + (int)(Math.random() * 80)))
│   │   │
│   │   ├── WebSocket Single Write: send_number
│   │   │   └── Data: 42["send_number",{"roomId":"${roomId}","no":${pick}}]
│   │   │
│   │   └── WebSocket Single Read: Wait for round_result or game_over
│   │       └── Response Time Assertion: < 2000ms
│   │
│   └── WebSocket Close Connection
│
├── Thread Group: Public Room (30% of load)
│   ├── [Same structure as Solo but roomType: "public"]
│   └── [Longer waits expected — bot fill delay 30s]
│
├── Listeners
│   ├── Aggregate Report
│   ├── Summary Report
│   ├── Response Times Over Time (requires plugin)
│   ├── Active Threads Over Time (requires plugin)
│   └── Backend Listener → InfluxDB/Grafana
│       └── influxdbUrl: http://localhost:8086/write?db=jmeter
│
└── Test Fragments (reusable)
    ├── Fragment: WS Handshake
    └── Fragment: WS Ping/Pong Keepalive
```

### 5.2 JMeter Properties File (jmeter.properties override)

```properties
# For load test
VU_COUNT=100
RAMP_UP_SECONDS=180
DURATION_SECONDS=1800

# For stress test
# VU_COUNT=500
# RAMP_UP_SECONDS=480
# DURATION_SECONDS=1200

# WebSocket timeout settings
websocket.timeout.connect=10000
websocket.timeout.response=5000

# Reporting
jmeter.reportgenerator.overall_granularity=5000
jmeter.reportgenerator.report_title=Numwit Load Test Report
```

### 5.3 Running JMeter (CLI/Headless)

```bash
# Install JMeter
wget https://downloads.apache.org/jmeter/binaries/apache-jmeter-5.6.3.tgz
tar -xzf apache-jmeter-5.6.3.tgz

# Install WebSocket plugin
# Download JMeter-WebSocket-Samplers-1.2.10.jar
# Place in apache-jmeter-5.6.3/lib/ext/

# Run load test (headless)
./apache-jmeter-5.6.3/bin/jmeter -n \
  -t numwit-load-test.jmx \
  -l results/load-$(date +%Y%m%d-%H%M).jtl \
  -e -o results/html-report-load \
  -JVUS=100 \
  -JRAMP=180 \
  -JDURATION=1800

# Generate HTML report from existing JTL
./apache-jmeter-5.6.3/bin/jmeter -g results/load.jtl -o results/html-report
```

---

## 6. Monitoring Dashboard Requirements

### 6.1 Required Metrics by Layer

#### Application (Node.js on Render)
Render exposes metrics via its dashboard and `/api/health`. For deeper metrics, instrument with `prom-client`:

```javascript
// server/monitoring/metrics.js  (add to server.js)
const client = require('prom-client');
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Custom metrics
const wsConnections = new client.Gauge({
  name: 'numwit_ws_connections_active',
  help: 'Active WebSocket connections',
  registers: [register],
});

const activeRooms = new client.Gauge({
  name: 'numwit_rooms_active',
  help: 'Active Redis rooms',
  registers: [register],
});

const roundLatencyHist = new client.Histogram({
  name: 'numwit_round_latency_seconds',
  help: 'Time from last send_number to round_result broadcast',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

const pendingDisconnectGauge = new client.Gauge({
  name: 'numwit_pending_disconnects',
  help: 'Number of active grace-period disconnect timers',
  registers: [register],
});

// Expose /metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

module.exports = { wsConnections, activeRooms, roundLatencyHist, pendingDisconnectGauge };
```

#### Redis (Render Redis)
Expose via Render dashboard or directly:
```bash
# Redis CLI commands for load test monitoring
redis-cli -u $REDIS_URL INFO stats | grep -E 'instantaneous_ops_per_sec|total_commands_processed'
redis-cli -u $REDIS_URL INFO memory | grep -E 'used_memory_human|mem_fragmentation_ratio'
redis-cli -u $REDIS_URL INFO clients | grep -E 'connected_clients|blocked_clients'
redis-cli -u $REDIS_URL DBSIZE  # total key count
```

#### PostgreSQL (Neon)
```sql
-- Active connections (run during load test)
SELECT count(*), state FROM pg_stat_activity GROUP BY state;

-- Slow queries (top 10 by total time)
SELECT query, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 10;

-- Table bloat indicator
SELECT relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC;
```

### 6.2 Grafana Dashboard Panels

**Recommended setup:** k6 → InfluxDB → Grafana (local docker-compose during testing)

```yaml
# docker-compose.yml for local monitoring stack
version: '3'
services:
  influxdb:
    image: influxdb:1.8
    ports: ['8086:8086']
    environment:
      INFLUXDB_DB: k6
      INFLUXDB_HTTP_AUTH_ENABLED: 'false'
  
  grafana:
    image: grafana/grafana:latest
    ports: ['3000:3000']
    environment:
      GF_AUTH_ANONYMOUS_ENABLED: 'true'
      GF_AUTH_ANONYMOUS_ORG_ROLE: Admin
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
```

```bash
# Run k6 with InfluxDB output
k6 run --out influxdb=http://localhost:8086/k6 load-test.js
```

**Required Dashboard Panels:**

| Panel | Metric | Visualization |
|-------|--------|---------------|
| Active Virtual Users | k6.vus | Time series (line) |
| Request Rate (RPS) | k6.http_reqs rate | Time series |
| HTTP Error Rate | k6.http_req_failed rate | Time series + threshold line at 1% |
| Response Time P50/P95/P99 | k6.http_req_duration percentiles | Time series multi-line |
| Socket Handshake Duration | k6.http_req_duration{name=handshake} | Time series |
| Round Result Latency | k6.round_result_latency_ms | Histogram + P95 |
| Game Completions | k6.game_completions rate | Counter / stat |
| Connection Error Rate | k6.connection_error_rate | Gauge |
| Node.js Heap Used | numwit_nodejs_heap_size_used_bytes | Time series |
| Node.js Event Loop Lag | numwit_nodejs_eventloop_lag_seconds | Time series |
| Active WebSocket Connections | numwit_ws_connections_active | Gauge |
| Active Rooms | numwit_rooms_active | Time series |
| Pending Disconnects | numwit_pending_disconnects | Time series |
| Redis Ops/sec | instantaneous_ops_per_sec | Time series |
| Redis Memory Used | used_memory_human | Gauge |
| Postgres Active Connections | pg connections count | Time series |

### 6.3 Alerting Rules

```yaml
# Grafana alerting rules
alerts:
  - name: High Error Rate
    condition: http_req_failed > 0.01
    duration: 2m
    severity: critical
    
  - name: P95 Latency SLA Breach
    condition: http_req_duration_p95 > 2000
    duration: 5m
    severity: warning
    
  - name: Node.js Heap Growing
    condition: nodejs_heap_size_used_bytes > 400MB AND rate > 0
    duration: 10m
    severity: warning
    
  - name: Redis Memory Near Limit
    condition: redis_used_memory > 20MB  # 80% of 25MB free tier
    duration: 5m
    severity: critical
    
  - name: WebSocket Connection Spike
    condition: ws_connections_active > 500
    duration: 1m
    severity: warning
    
  - name: Postgres Connection Exhaustion
    condition: pg_active_connections > 9  # Neon free = 10 max
    duration: 2m
    severity: critical
```

---

## 7. Pass/Fail Criteria

### 7.1 Per-Test-Type Criteria

#### Smoke Test — PASS requires ALL:
- [ ] `/api/health` returns `{"status":"ok"}` with HTTP 200
- [ ] Zero socket connection errors in 5 VUs
- [ ] At least one full game round completes (next_round → round_result)
- [ ] No 5xx responses

#### Baseline Test — PASS requires ALL:
- [ ] P95 HTTP response time < 500ms for `/api/health`
- [ ] P95 HTTP response time < 1,500ms for `/api/stats`
- [ ] P95 round_result latency < 300ms after all players submit
- [ ] HTTP error rate < 0.1%
- [ ] WebSocket connection error rate < 0.5%
- [ ] Node.js heap usage < 200MB (stable, not growing)
- [ ] At least 90% of submitted `send_number` events result in a `round_result`

#### Load Test (100 VUs) — PASS requires ALL:
- [ ] P50 round_result latency < 100ms
- [ ] P95 round_result latency < 500ms
- [ ] P99 round_result latency < 1,000ms
- [ ] HTTP error rate < 1%
- [ ] WebSocket connection error rate < 2%
- [ ] Game completion rate > 95% of started sessions
- [ ] Node.js heap stable (±10% between T+5min and T+25min)
- [ ] Redis key count proportional to active rooms (no unbounded growth)
- [ ] Postgres query P99 < 2,000ms for stats endpoints
- [ ] Zero `ECONNREFUSED` or `ETIMEDOUT` errors

#### Stress Test — PASS requires ALL at maximum sustained VU count:
- [ ] System remains functional (error rate < 10%)
- [ ] P99 latency < 5,000ms (degraded but not failed)
- [ ] System recovers within 2 minutes of returning to 100 VU baseline
- [ ] Node.js does NOT OOM-crash during or after the test
- [ ] Redis does NOT return NOAUTH or OOM errors

#### Spike Test — PASS requires ALL:
- [ ] Error rate during spike peak < 15%
- [ ] Error rate returns to < 2% within 60 seconds of spike ending
- [ ] P95 latency returns to baseline within 120 seconds of spike ending
- [ ] No game rooms become corrupted (stuck state) after spike

#### Soak Test — PASS requires ALL over 24 hours:
- [ ] Error rate < 2% at any measured interval
- [ ] Node.js heap does NOT grow by > 20% between T+1h and T+24h
- [ ] Redis key count remains proportional to active rooms (no silent accumulation)
- [ ] `/api/health` returns 200 for > 99.9% of checks throughout 24h
- [ ] No `botService`, `timerService`, or `pendingDisconnects` map size grows unboundedly

#### Breakpoint Test — RECORD:
- [ ] VU count at which P95 > 500ms: ______
- [ ] VU count at which P95 > 2,000ms: ______
- [ ] VU count at which error rate > 1%: ______
- [ ] VU count at which error rate > 5%: ______
- [ ] VU count at which process crashes or Render restarts: ______
- [ ] Failure mode observed: ______

### 7.2 SLA Summary Table

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| HTTP P50 | < 100ms | > 200ms | > 500ms |
| HTTP P95 | < 500ms | > 1,000ms | > 2,000ms |
| HTTP P99 | < 1,000ms | > 2,000ms | > 5,000ms |
| Round result latency P95 | < 500ms | > 1,000ms | > 3,000ms |
| WebSocket handshake P95 | < 1,000ms | > 2,000ms | > 5,000ms |
| HTTP error rate | < 0.5% | > 1% | > 5% |
| WS connection error rate | < 1% | > 2% | > 10% |
| Node.js heap | < 256MB | > 400MB | > 512MB |
| Redis memory | < 15MB | > 20MB | > 24MB |
| Postgres connections | < 6 | > 8 | > 9 |
| Event loop lag | < 10ms | > 50ms | > 200ms |

---

## 8. Bottleneck Analysis & Scaling Limits

### 8.1 Expected Bottleneck Sequence Under Load

```
Users:  10–50          → No bottlenecks. Everything smooth.
Users:  50–100         → Redis write contention during round_result bursts.
                         (Multiple rooms end rounds simultaneously → write spike)
Users:  100–200        → Node.js event loop lag increases.
                         Timer heap grows (more setTimeout handles).
                         Render CPU throttling begins.
Users:  200–350        → WebSocket backpressure.
                         Socket.IO emit() starts queuing when client buffers full.
                         Neon Postgres connections approach pool limit (10).
Users:  350–500        → Redis Render free tier (25MB) approaches limit
                         if rooms are not being cleaned up fast enough.
                         OOM risk: Node.js heap > 512MB on Render starter.
Users:  500+           → Render container likely OOM-killed or CPU-throttled.
                         Process restart → all in-memory timers lost.
                         Users experience mass disconnect → reconnect storm.
```

### 8.2 Estimated Scaling Limits by Tier

| Tier | Concurrent Users | Active Rooms | Constraint |
|------|-----------------|--------------|------------|
| Render Free (512MB, shared CPU) | ~50–80 | ~15–25 | Sleeps after inactivity; CPU throttled |
| Render Starter ($7/mo, 512MB) | ~100–150 | ~30–50 | RAM, CPU |
| Render Standard ($25/mo, 2GB) | ~300–500 | ~100–170 | CPU, Redis |
| Render Pro ($85/mo, 4GB + 2 CPU) | ~800–1,200 | ~270–400 | Redis becomes bottleneck |
| Render + Redis upgrade | ~1,500+ | ~500+ | Horizontal Node.js scaling needed |
| Multi-instance + Redis adapter | ~5,000+ | ~1,500+ | Requires sticky sessions |

### 8.3 Specific Code-Level Bottlenecks to Measure

| Code path | File | What to measure | Expected threshold |
|-----------|------|----------------|-------------------|
| `send_number` handler full path | `game.js` | Time from socket event to `round_result` emit | < 50ms for 3–8 players |
| `saveRoom()` Redis write | `roomManager.js` | Redis `SET` latency | < 5ms P99 |
| `getRoomById()` Redis read | `roomManager.js` | Redis `GET` latency | < 3ms P99 |
| `evaluateRound()` computation | `gameManager.js` | CPU time, synchronous | < 1ms for 8 players |
| `persistGameOver()` DB write | `game.js` | Postgres write (3–4 tables) | < 500ms P95 |
| Bot submission scheduling | `botService.js` | `setTimeout` count × rooms | Linear growth expected |
| Socket.IO `io.to(room).emit()` | All handlers | Broadcast time for 8-member room | < 5ms P99 |
| Grace period timer set/clear | `lobby.js` | Memory (Map size) | Must plateau, not grow |

---

## 9. Infrastructure Recommendations

### 9.1 Immediate (Before Load Testing)

1. **Upgrade Render to Starter or Standard tier** — Free tier sleeps. Load tests against a sleeping instance are meaningless. Starter ($7/mo) is always-on.

2. **Add `/metrics` Prometheus endpoint** — Without instrumentation you are flying blind. See §6.1 for the code.

3. **Upgrade Render Redis to a paid tier** — Free Redis (25MB) will OOM under any meaningful load. Render Redis Starter gives 100MB+ with persistence.

4. **Set `NODE_OPTIONS=--max-old-space-size=400`** on Render — prevents Node.js from consuming all available RAM before Render's OOM killer fires.

5. **Wire `/api/health` into Render's health check** — if the process becomes unresponsive (event loop blocked), Render will restart it only if health checks fail. Set the health check path to `/api/health` in Render's dashboard.

### 9.2 Short-Term (After Initial Load Test Results)

6. **Add static file CDN offload** — Serve `client/dist` through Cloudflare (free) instead of Express. This removes all static file requests from the Node.js event loop (~15–20% CPU reduction at load).

7. **Redis connection pooling** — Use `ioredis` cluster mode or a connection pool library. Current single `ioredis` client handles ~30k ops/sec on Redis but request queuing can cause latency spikes.

8. **Move stats endpoint behind a 30-second cache** — `/api/stats` and `/api/leaderboard` are read-heavy. A simple in-memory TTL cache (`node-cache`) reduces Postgres and Redis load dramatically.

   ```javascript
   // server/utils/statsCache.js
   const NodeCache = require('node-cache');
   const cache = new NodeCache({ stdTTL: 30 });
   // In stats route: check cache first, fallback to DB query
   ```

9. **Replace `console.debug` with structured JSON logging (pino)** — `console.log` in high-throughput paths is synchronous and blocks the event loop. `pino` uses async batched writes.

### 9.3 Long-Term (If Scaling Beyond 300 Concurrent Users)

10. **Horizontal scaling with Redis adapter** — Already wired in `server.js` via `@socket.io/redis-adapter`. Activate by setting `REDIS_ADAPTER_URL`. Add a second Render instance. Requires Render's sticky sessions.

11. **Replace in-memory timers with BullMQ** — All `setTimeout`-based timers (`timerService`, `roomCleanup`, `botService`, `pendingDisconnects`) must move to Redis-backed job queues to work across multiple instances.

12. **Redis Cluster or Upstash Redis** — At 500+ concurrent rooms, a single Redis instance becomes the bottleneck. Upstash's serverless Redis scales automatically per-request; Redis Cloud's paid tiers offer dedicated instances with predictable performance.

13. **Offload bot service to worker threads** — Bot submission timers and computations can move to Node.js `worker_threads` to avoid competing with the event loop for game-critical paths.

14. **Add PostgreSQL connection pooling via PgBouncer** — Neon's pooler is already used (see NEON_PRODUCTION_SETUP.md), but for high write concurrency (`persistGameOver` bursts) consider PgBouncer in transaction mode.

---

## Appendix A: Test Execution Checklist

### Pre-Test
- [ ] Confirm Render instance is on **paid tier** (Starter or above)
- [ ] Confirm Render Redis is on **paid tier** (not free)
- [ ] Run smoke test and confirm 0 errors before any other test
- [ ] Take baseline snapshot: Node.js heap, Redis memory, Postgres connections
- [ ] Disable Sentry error rate limiting during stress test (or it will throttle alerts)
- [ ] Notify team: load test in progress (avoid manual testing concurrently)
- [ ] Set up Grafana dashboard and confirm metrics flowing

### During Test
- [ ] Monitor Render dashboard for CPU/RAM alerts
- [ ] Watch `redis-cli INFO stats` every 5 minutes
- [ ] Check Neon Postgres connection count
- [ ] Watch for Render auto-restarts (check Render logs)

### Post-Test
- [ ] Compare all metrics against baseline
- [ ] Export k6 HTML report: `k6 run --out json=out.json ... && k6-reporter out.json`
- [ ] Archive JTL/JSON result files with test parameters in filename
- [ ] File findings as issues with reproduction steps
- [ ] Update this document with actual measured limits

---

## Appendix B: Quick Reference — Key Redis Commands During Testing

```bash
export REDIS_URL="your-render-redis-url"

# Ops/sec (run repeatedly)
redis-cli -u $REDIS_URL INFO stats | grep instantaneous_ops_per_sec

# Memory usage
redis-cli -u $REDIS_URL INFO memory | grep -E 'used_memory_human|maxmemory_human'

# Active rooms count
redis-cli -u $REDIS_URL KEYS "room:*" | wc -l

# Slow log (commands > 10ms)
redis-cli -u $REDIS_URL CONFIG SET slowlog-log-slower-than 10000
redis-cli -u $REDIS_URL SLOWLOG GET 20

# Pub/Sub activity (if Redis adapter enabled)
redis-cli -u $REDIS_URL PUBSUB CHANNELS

# Connected clients
redis-cli -u $REDIS_URL CLIENT LIST | wc -l
```

---

*Document version: 1.0 | Author: Senior Performance Test Engineer | Numwit Production Load Testing Strategy*
