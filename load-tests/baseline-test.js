/**
 * baseline-test.js
 * ----------------
 * 20 fake players, 15 minutes.
 * Goal: measure how fast your game is TODAY with low traffic.
 * This becomes your "before" photo — save the results!
 *
 * Run:
 *   k6 run baseline-test.js
 *
 * Save results to a file:
 *   k6 run baseline-test.js --out json=results/baseline.json
 */

import ws    from 'k6/ws';
import http  from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { handshake, connectViaPolling, wsUrl, encodeEvent, parseFrame } from './utils/socketio.js';

const BASE_URL = __ENV.BASE_URL || 'https://numwit.onrender.com';

// ── Custom metrics (these appear in the final report) ────────────────────────
// How long from "all players submitted" to "result arrives"
const roundResultDelay = new Trend('round_result_latency_ms', true);
// How many full games completed successfully
const gamesCompleted   = new Counter('games_completed');
// How often a number submission succeeded
const submitOkRate     = new Rate('submit_success_rate');
// How often the WebSocket connection itself failed
const connectFailRate  = new Rate('connect_fail_rate');

// ── Test settings ────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // 16 players playing solo games in a loop
    solo_players: {
      executor:  'constant-vus',
      vus:       16,
      duration:  '15m',
      exec:      'playSoloGame',
    },
    // 4 players just polling the REST API (like the landing page does)
    rest_watchers: {
      executor:  'constant-vus',
      vus:       4,
      duration:  '15m',
      exec:      'pollRestApi',
    },
  },

  // PASS rules
  thresholds: {
    // REST API must be fast
    'http_req_duration{api:health}':      ['p(95)<500'],
    'http_req_duration{api:stats}':       ['p(95)<1500'],

    // Game must respond quickly
    'round_result_latency_ms':            ['p(95)<500'],

    // Reliability
    'http_req_failed':                    ['rate<0.01'],
    'connect_fail_rate':                  ['rate<0.02'],
    'submit_success_rate':                ['rate>0.97'],

    // At least 30 full games must complete in 15 minutes
    'games_completed':                    ['count>30'],
  },
};

// ── Scenario 1: Poll REST API ─────────────────────────────────────────────────
export function pollRestApi() {
  http.get(`${BASE_URL}/api/health`, { tags: { api: 'health' } });
  sleep(5);
  http.get(`${BASE_URL}/api/stats`, { tags: { api: 'stats' } });
  sleep(10);
}

// ── Scenario 2: Play a full solo game ────────────────────────────────────────
export function playSoloGame() {
  const vuId     = __VU;
  const deviceId = `k6-baseline-vu${vuId}-${Date.now()}`;
  const user     = { name: `BaseUser${vuId}`, avatar: '🎯' };

  // Handshake
  const session = handshake(BASE_URL);
  if (!session) {
    connectFailRate.add(1);
    sleep(5);
    return;
  }
  connectFailRate.add(0);
  connectViaPolling(BASE_URL, session.sid);

  const url = wsUrl(BASE_URL, session.sid);

  let currentRoomId = null;
  let submitted     = false;
  let submitTime    = null;
  let connected     = false;
  let gameEnded     = false;

  const res = ws.connect(url, {}, function (socket) {

    socket.on('open', () => { socket.send('2probe'); });

    socket.on('message', (raw) => {
      const frame = parseFrame(raw);

      if (frame.kind === 'ping') { socket.send('3'); return; }
      if (frame.kind === 'probe_ack') { socket.send('5'); return; }

      if (frame.kind === 'connected' && !connected) {
        connected = true;
        socket.send(encodeEvent('join_room', {
          roomId:   null,
          user:     user,
          roomType: 'solo',
          deviceId: deviceId,
        }));
      }

      if (frame.kind !== 'event') return;

      if (frame.event === 'room_update' && frame.data) {
        currentRoomId = frame.data.id;
      }

      // New round started — think then submit
      if (frame.event === 'next_round' && !submitted) {
        submitted = true;

        // Think time: 4–18 seconds (realistic human decision)
        const thinkMs = 4000 + Math.random() * 14000;
        socket.setTimeout(() => {
          const no = 10 + Math.floor(Math.random() * 70);
          // Start timing HERE — right when we send the number
          // This measures server processing time only (not think time)
          submitTime = Date.now();
          socket.send(encodeEvent('send_number', {
            roomId: currentRoomId,
            no:     no,
          }));
        }, thinkMs);
      }

      // Round result arrived
      if (frame.event === 'round_result') {
        if (submitTime) {
          roundResultDelay.add(Date.now() - submitTime);
          submitTime = null;
        }
        submitOkRate.add(1);
        submitted = false; // ready for next round
      }

      // Round was voided (all same number) — just reset
      if (frame.event === 'round_void') {
        submitted = false;
        submitOkRate.add(0);
      }

      // Game over
      if (frame.event === 'game_over' || frame.event === 'room_deleted') {
        gamesCompleted.add(1);
        gameEnded = true;
        socket.close();
      }
    });

    socket.on('error', (e) => {
      console.error(`VU${vuId} error: ${e.error}`);
      connectFailRate.add(1);
    });

    // Safety close after 3 minutes
    socket.setTimeout(() => socket.close(), 3 * 60 * 1000);
  });

  // Small gap between game sessions
  sleep(3 + Math.random() * 5);
}
