/**
 * game.js — one fake player, shared by smoke / hn / breakpoint tests.
 * --------
 * Plays a real game over Socket.IO the way a person does: join, wait for a
 * round, "think", pick, watch the result, until game over.
 *
 * Measures (all in ms, from this machine — includes the network round trip
 * to the server, ~250 ms from India to Fly's iad region):
 *   pick_ack_ms        send_number → number_received. The server answers this
 *                      straight away, so it is the cleanest server-speed metric.
 *   round_result_ms    send_number → round_result, only when everyone else had
 *                      already picked (per waiting_for_players) — otherwise it
 *                      would include other players' thinking time.
 *   first_round_ms     join_room → first next_round (how long until you play).
 * Database load isn't visible from here (the server announces game over first
 * and saves afterwards) — watch the Neon dashboard for that.
 *
 * Fixes vs the June scripts: an eliminated player stops picking (the server
 * ignores those picks, and timing them recorded the bots' rounds as "server
 * delay" — the 30 s spikes), and fake players are clearly named "k6-…".
 */
import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { wsDirectUrl, encodeEvent, parseFrame, EIO_MESSAGE, SIO_CONNECT } from './socketio.js';

export const pickAck      = new Trend('pick_ack_ms', true);
export const roundResult  = new Trend('round_result_ms', true);
export const firstRound   = new Trend('first_round_ms', true);
export const connectFail  = new Rate('connect_fail_rate');
export const pickAccepted = new Rate('pick_accepted_rate');
export const gamesDone    = new Counter('games_completed');
export const gamesCut     = new Counter('games_timed_out');

/** The server to test. Required, so nobody load-tests the wrong place by accident. */
export function baseUrl() {
  const url = __ENV.BASE_URL;
  if (!url) throw new Error('Set BASE_URL, e.g.  k6 run -e BASE_URL=https://numwit.prajvex.com hn-test.js');
  return url.replace(/\/$/, '');
}

const rand = (min, max) => min + Math.random() * (max - min);

/**
 * Play one game. kind: "solo" | "public". Returns when the game ends or after
 * maxMinutes (a stuck game counts as games_timed_out).
 */
export function playGame(BASE, { kind = 'solo', label = 'load', thinkMin = 3, thinkMax = 15, maxMinutes = 6 } = {}) {
  const deviceId = `k6-${label}-${__VU}-${__ITER}-${Date.now()}`;
  const user = { name: `k6-${label}${__VU}`.slice(0, 20), avatar: '🤖' };

  // Straight to WebSocket, like the browser client (no polling handshake)
  let opened = false;
  const res = ws.connect(wsDirectUrl(BASE), {}, function (socket) {
    let joined = false;
    let joinAt = 0;
    let gotFirstRound = false;
    let mySocketId = null;
    let eliminated = false;
    let pickedThisRound = false;
    let pickSentAt = 0;
    let waitingAck = false;
    let done = false;
    let roomId = null;
    let pickedIds = [];      // who has picked this round (from waiting_for_players)
    let pickTotal = 0;       // how many players are picking this round
    let lastToPick = false;  // were all the others already done when we picked?

    socket.on('open', () => { opened = true; });

    socket.on('message', (raw) => {
      const frame = parseFrame(raw);
      if (frame.kind === 'open') { socket.send(EIO_MESSAGE + SIO_CONNECT); return; }
      if (frame.kind === 'ping') { socket.send('3'); return; }

      if (frame.kind === 'connected' && !joined) {
        joined = true;
        joinAt = Date.now();
        socket.send(encodeEvent('join_room', { roomId: null, user, roomType: kind, deviceId }));
        return;
      }
      if (frame.kind !== 'event') return;
      const { event, data } = frame;

      if (event === 'room_update' && data) {
        // Which player is us (the server tags us with our deviceId)
        const me = (data.users || []).find((u) => u.deviceId === deviceId);
        if (me) mySocketId = me.socketId;
        if (!roomId) roomId = data.id;
      }

      if (event === 'next_round') {
        if (!gotFirstRound) { gotFirstRound = true; firstRound.add(Date.now() - joinAt); }
        pickedThisRound = false;
        pickedIds = [];
        pickTotal = 0;
        if (eliminated) return;
        socket.setTimeout(() => {
          if (eliminated || pickedThisRound || done) return;
          pickedThisRound = true;
          waitingAck = true;
          lastToPick = pickTotal > 0 && pickedIds.length === pickTotal - 1 && pickedIds.indexOf(mySocketId) === -1;
          pickSentAt = Date.now();
          socket.send(encodeEvent('send_number', { roomId, user, no: Math.floor(rand(0, 60)) }));
        }, rand(thinkMin, thinkMax) * 1000);
      }

      if (event === 'waiting_for_players' && data) {
        pickedIds = data.submittedIds || [];
        pickTotal = data.total || 0;
      }

      if (event === 'number_received' && waitingAck) {
        waitingAck = false;
        pickAck.add(Date.now() - pickSentAt);
        pickAccepted.add(1);
      }
      if ((event === 'round_already_completed' || event === 'invalid_number') && waitingAck) {
        waitingAck = false;
        pickAccepted.add(0);
      }

      if (event === 'round_result') {
        // Only meaningful when our pick was the one that completed the round —
        // otherwise it would include the other players' (or bots') thinking time
        if (pickedThisRound && lastToPick && pickSentAt) roundResult.add(Date.now() - pickSentAt);
        pickSentAt = 0;
        lastToPick = false;
      }

      if (event === 'round_void') { pickedThisRound = false; pickSentAt = 0; }

      if (event === 'player_eliminated' && data && data.socketId === mySocketId) eliminated = true;

      if (event === 'game_over' || event === 'room_deleted') {
        done = true;
        gamesDone.add(1);
        // a few seconds on the game-over screen, then leave
        socket.setTimeout(() => socket.close(), rand(2, 6) * 1000);
      }
    });

    socket.on('error', () => { if (!opened) connectFail.add(1); });

    socket.setTimeout(() => {
      if (!done) gamesCut.add(1);
      socket.close();
    }, maxMinutes * 60 * 1000);
  });

  connectFail.add(opened ? 0 : 1);
  check(res, { 'websocket connected (101)': (r) => r && r.status === 101 });
  sleep(rand(2, 6)); // between games
}

/** A visitor reading the site: home page, bundle, live stats, leaderboards. */
export function browse(BASE) {
  const get = (path, tag) => http.get(`${BASE}${path}`, { tags: { page: tag } });
  check(get('/', 'home'), { 'home 200': (r) => r.status === 200 });
  get('/bundle.js', 'bundle');
  sleep(rand(1, 3));
  check(get('/api/stats', 'stats'), { 'stats 200': (r) => r.status === 200 });
  sleep(rand(3, 8));
  check(get('/api/leaderboard?limit=50', 'leaderboard'), { 'leaderboard 200': (r) => r.status === 200 });
  sleep(rand(2, 5));
  get('/api/leaderboard?limit=50&period=all', 'leaderboard_all');
  sleep(rand(5, 15));
}
