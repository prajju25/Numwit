/**
 * smoke-test.js
 * -------------
 * The simplest test — just checks the game is alive.
 *
 * What it does:
 *   5 fake players connect, join a solo game, pick a number, get a result.
 *   Runs for 2 minutes.
 *
 * Run:
 *   k6 run smoke-test.js
 *
 * Pass = zero errors, all checks green
 */

import ws    from 'k6/ws';
import http  from 'k6/http';
import { check, sleep } from 'k6';
import { handshake, connectViaPolling, wsUrl, encodeEvent, parseFrame } from './utils/socketio.js';

// ── Where is the game? ───────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://numwit.onrender.com';

// ── Test settings ────────────────────────────────────────────────────────────
export const options = {
  vus:      5,       // 5 fake players
  duration: '2m',    // run for 2 minutes

  // These are the PASS rules — if any fail, the test fails
  thresholds: {
    checks:           ['rate==1.00'],  // 100% of all checks must pass
    http_req_failed:  ['rate<0.01'],   // less than 1% HTTP errors
    http_req_duration: ['p(95)<3000'], // 95% of HTTP requests under 3 seconds
  },
};

// ── This function runs once per fake player ──────────────────────────────────
export default function () {
  const vuId     = __VU;                     // which fake player this is (1–5)
  const deviceId = `k6-smoke-vu${vuId}`;
  const user     = { name: `SmokeUser${vuId}`, avatar: '🤖' };

  // ── Step 1: Check REST API is alive ─────────────────────────────────────
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, {
    '✅ /api/health returns 200': (r) => r.status === 200,
    '✅ /api/health says ok':     (r) => {
      try { return JSON.parse(r.body).status === 'ok'; }
      catch (_) { return false; }
    },
  });

  const stats = http.get(`${BASE_URL}/api/stats`);
  check(stats, {
    '✅ /api/stats returns 200': (r) => r.status === 200,
  });

  sleep(1);

  // ── Step 2: Socket.IO handshake ──────────────────────────────────────────
  const session = handshake(BASE_URL);
  check(session, {
    '✅ Socket.IO handshake got session ID': (s) => s !== null && !!s.sid,
  });
  if (!session) return;

  connectViaPolling(BASE_URL, session.sid);

  // ── Step 3: Upgrade to WebSocket and play a round ───────────────────────
  let roundReceived  = false;
  let resultReceived = false;
  let currentRoomId  = null;
  let submitted      = false;
  let connected      = false;

  const url = wsUrl(BASE_URL, session.sid);

  const res = ws.connect(url, {}, function (socket) {

    socket.on('open', () => {
      // Engine.IO upgrade handshake
      socket.send('2probe');
    });

    socket.on('message', (raw) => {
      const frame = parseFrame(raw);

      // Reply to server keepalive pings
      if (frame.kind === 'ping') { socket.send('3'); return; }

      // Engine.IO probe acknowledged → confirm upgrade
      if (frame.kind === 'probe_ack') { socket.send('5'); return; }

      // Socket.IO fully connected → join a solo game
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

      // Capture the room ID from the first room_update
      if (frame.event === 'room_update' && frame.data) {
        currentRoomId = frame.data.id;
      }

      // Server started the round — pick a number
      if (frame.event === 'next_round' && !submitted) {
        roundReceived = true;
        submitted     = true;
        // Wait 3 seconds (like a human thinking), then submit
        socket.setTimeout(() => {
          socket.send(encodeEvent('send_number', {
            roomId: currentRoomId,
            no:     42, // fixed number for smoke test
          }));
        }, 3000);
      }

      // We got the round result — success!
      if (frame.event === 'round_result') {
        resultReceived = true;
      }

      // Game ended — close the connection
      if (frame.event === 'game_over' || frame.event === 'room_deleted') {
        socket.close();
      }
    });

    socket.on('error', (e) => {
      console.error(`VU${vuId} WebSocket error: ${e.error}`);
    });

    // Safety: close after 45 seconds no matter what
    socket.setTimeout(() => socket.close(), 45000);
  });

  // ── Step 4: Final checks ─────────────────────────────────────────────────
  check(res, {
    '✅ WebSocket connection opened': (r) => r && r.status === 101,
  });
  check(null, {
    '✅ Game round was received':  () => roundReceived,
    '✅ Round result was received': () => resultReceived,
  });

  sleep(2);
}
