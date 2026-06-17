/**
 * load-test.js
 * ------------
 * 100 fake players, 30 minutes.
 * This is the MAIN test — simulates a real busy day.
 *
 * Player mix:
 *   60 → playing solo games (most common)
 *   25 → joining public rooms (matchmaking)
 *   15 → just checking the website (REST API polling)
 *
 * Run:
 *   k6 run load-test.js
 *
 * Save results:
 *   k6 run load-test.js --out json=results/load-test.json
 */

import ws    from 'k6/ws';
import http  from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { handshake, connectViaPolling, wsUrl, encodeEvent, parseFrame } from './utils/socketio.js';

const BASE_URL = __ENV.BASE_URL || 'https://numwit.onrender.com';

// ── Custom metrics ───────────────────────────────────────────────────────────
const roundResultDelay  = new Trend('round_result_latency_ms', true);
const gamesCompleted    = new Counter('games_completed');
const submitOkRate      = new Rate('submit_success_rate');
const connectFailRate   = new Rate('connect_fail_rate');

// ── Test settings ─────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // 60 VUs playing solo games
    solo_players: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '1m',  target: 20 }, // gentle ramp up
        { duration: '1m',  target: 40 },
        { duration: '1m',  target: 60 }, // reach target
        { duration: '25m', target: 60 }, // hold for 25 min
        { duration: '2m',  target: 0  }, // ramp down
      ],
      exec: 'playSoloGame',
    },

    // 25 VUs joining public rooms
    public_players: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '2m',  target: 10 },
        { duration: '1m',  target: 25 },
        { duration: '24m', target: 25 },
        { duration: '3m',  target: 0  },
      ],
      exec: 'playPublicGame',
    },

    // 15 VUs browsing the landing page / polling stats
    rest_browsers: {
      executor:  'constant-vus',
      vus:       15,
      duration:  '30m',
      exec:      'browseWebsite',
    },
  },

  // ── PASS / FAIL rules ────────────────────────────────────────────────────
  thresholds: {
    // Response time targets
    'http_req_duration{api:health}':      ['p(95)<500'],
    'http_req_duration{api:stats}':       ['p(95)<2000'],
    'round_result_latency_ms':            ['p(50)<200', 'p(95)<800', 'p(99)<2000'],

    // Reliability targets
    'http_req_failed':                    ['rate<0.01'],   // < 1% errors
    'connect_fail_rate':                  ['rate<0.03'],   // < 3% connection failures
    'submit_success_rate':                ['rate>0.95'],   // > 95% submissions work

    // Volume targets — proves we actually ran a real test
    'games_completed':                    ['count>50'],    // at least 50 full games
  },
};

// ── Scenario: Browse the website ─────────────────────────────────────────────
export function browseWebsite() {
  // Check health
  const h = http.get(`${BASE_URL}/api/health`, { tags: { api: 'health' } });
  check(h, { 'health ok': (r) => r.status === 200 });
  sleep(5 + Math.random() * 10);

  // Check stats (landing page live counter)
  const s = http.get(`${BASE_URL}/api/stats`, { tags: { api: 'stats' } });
  check(s, { 'stats ok': (r) => r.status === 200 });
  sleep(10 + Math.random() * 10);
}

// ── Scenario: Play a solo game ────────────────────────────────────────────────
export function playSoloGame() {
  const vuId     = __VU;
  const deviceId = `k6-load-solo-${vuId}-${Date.now()}`;
  const user     = { name: `LoadUser${vuId}`, avatar: '🎮' };

  const session = handshake(BASE_URL);
  if (!session) {
    connectFailRate.add(1);
    sleep(5);
    return;
  }
  connectFailRate.add(0);
  connectViaPolling(BASE_URL, session.sid);

  const url     = wsUrl(BASE_URL, session.sid);
  let roomId    = null;
  let submitted = false;
  let sendTime  = null;
  let connected = false;

  ws.connect(url, {}, function (socket) {
    socket.on('open', () => { socket.send('2probe'); });

    socket.on('message', (raw) => {
      const frame = parseFrame(raw);

      if (frame.kind === 'ping')      { socket.send('3');  return; }
      if (frame.kind === 'probe_ack') { socket.send('5');  return; }

      if (frame.kind === 'connected' && !connected) {
        connected = true;
        socket.send(encodeEvent('join_room', {
          roomId: null, user, roomType: 'solo', deviceId,
        }));
      }

      if (frame.kind !== 'event') return;

      if (frame.event === 'room_update' && frame.data) {
        roomId = frame.data.id;
      }

      if (frame.event === 'next_round' && !submitted) {
        submitted = true;

        // Human think time: 3–20 seconds
        const thinkMs = 3000 + Math.random() * 17000;
        socket.setTimeout(() => {
          const no = 5 + Math.floor(Math.random() * 85);
          // Start timing HERE — measures server processing only, not think time
          sendTime = Date.now();
          socket.send(encodeEvent('send_number', { roomId, no }));
        }, thinkMs);
      }

      if (frame.event === 'round_result') {
        if (sendTime) { roundResultDelay.add(Date.now() - sendTime); sendTime = null; }
        submitOkRate.add(1);
        submitted = false;
      }

      if (frame.event === 'round_void') {
        submitted = false;
        submitOkRate.add(0);
      }

      if (frame.event === 'game_over' || frame.event === 'room_deleted') {
        gamesCompleted.add(1);
        socket.close();
      }
    });

    socket.on('error', () => connectFailRate.add(1));

    // Safety: close after 4 minutes max
    socket.setTimeout(() => socket.close(), 4 * 60 * 1000);
  });

  // Cool down between sessions (2–6 seconds)
  sleep(2 + Math.random() * 4);
}

// ── Scenario: Play a public matchmaking game ──────────────────────────────────
export function playPublicGame() {
  const vuId     = __VU;
  const deviceId = `k6-load-pub-${vuId}-${Date.now()}`;
  const user     = { name: `PubUser${vuId}`, avatar: '🌍' };

  const session = handshake(BASE_URL);
  if (!session) {
    connectFailRate.add(1);
    sleep(10);
    return;
  }
  connectFailRate.add(0);
  connectViaPolling(BASE_URL, session.sid);

  const url     = wsUrl(BASE_URL, session.sid);
  let roomId    = null;
  let submitted = false;
  let sendTime  = null;
  let connected = false;

  ws.connect(url, {}, function (socket) {
    socket.on('open', () => { socket.send('2probe'); });

    socket.on('message', (raw) => {
      const frame = parseFrame(raw);

      if (frame.kind === 'ping')      { socket.send('3');  return; }
      if (frame.kind === 'probe_ack') { socket.send('5');  return; }

      if (frame.kind === 'connected' && !connected) {
        connected = true;
        // Join public matchmaking
        socket.send(encodeEvent('join_room', {
          roomId: null, user, roomType: 'public', deviceId,
        }));
      }

      if (frame.kind !== 'event') return;

      if (frame.event === 'room_update' && frame.data) {
        roomId = frame.data.id;
      }

      if (frame.event === 'next_round' && !submitted) {
        submitted = true;
        // Public players think a bit longer
        const thinkMs = 5000 + Math.random() * 18000;
        socket.setTimeout(() => {
          const no = 5 + Math.floor(Math.random() * 85);
          // Start timing HERE — measures server processing only, not think time
          sendTime = Date.now();
          socket.send(encodeEvent('send_number', { roomId, no }));
        }, thinkMs);
      }

      if (frame.event === 'round_result') {
        if (sendTime) { roundResultDelay.add(Date.now() - sendTime); sendTime = null; }
        submitOkRate.add(1);
        submitted = false;
      }

      if (frame.event === 'round_void') { submitted = false; }

      if (frame.event === 'game_over' || frame.event === 'room_deleted') {
        gamesCompleted.add(1);
        socket.close();
      }
    });

    socket.on('error', () => connectFailRate.add(1));

    // Public games can take longer (waiting + playing)
    socket.setTimeout(() => socket.close(), 5 * 60 * 1000);
  });

  sleep(5 + Math.random() * 5);
}
