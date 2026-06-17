/**
 * socketio.js
 * -----------
 * Helpers to speak Socket.IO protocol inside k6.
 *
 * Socket.IO uses two layers:
 *   Engine.IO  (outer)  — controls the transport (open/ping/pong/upgrade)
 *   Socket.IO  (inner)  — carries your events (join_room, send_number, etc.)
 *
 * Wire format of a message you SEND:
 *   "42["event_name", { ...data }]"
 *    ^^ = Engine.IO MESSAGE (4) + Socket.IO EVENT (2)
 *
 * Wire format of a PING you receive from server:
 *   "2"  → you must reply with "3" (pong) within 5 seconds
 */

import http from 'k6/http';

// ── Engine.IO frame types ────────────────────────────────────────────────────
export const EIO_OPEN    = '0';
export const EIO_PING    = '2';
export const EIO_PONG    = '3';
export const EIO_MESSAGE = '4';
export const EIO_UPGRADE = '5';

// ── Socket.IO packet types ───────────────────────────────────────────────────
export const SIO_CONNECT = '0';
export const SIO_EVENT   = '2';

/**
 * Step 1 of the Socket.IO handshake.
 * Makes an HTTP GET to /socket.io/?EIO=4&transport=polling
 * Returns the session object { sid, pingInterval, pingTimeout }
 * Returns null if the handshake fails.
 */
export function handshake(baseUrl) {
  const url = `${baseUrl}/socket.io/?EIO=4&transport=polling`;
  const res  = http.get(url, { timeout: '10s' });

  if (res.status !== 200) {
    console.error(`Handshake failed: HTTP ${res.status}`);
    return null;
  }

  // Server response looks like:
  //   0{"sid":"AbCdEf","upgrades":["websocket"],"pingInterval":5000,...}
  // Engine.IO 4 sends no length prefix — the response is just 0{...json...}
  // We find the first '{' and parse from there.
  const body     = res.body || '';
  const jsonStart = body.indexOf('{');

  if (jsonStart === -1) {
    console.error(`Handshake: no JSON found in response: ${body}`);
    return null;
  }

  try {
    return JSON.parse(body.slice(jsonStart)); // { sid, upgrades, pingInterval, pingTimeout }
  } catch (_) {
    console.error(`Handshake parse error: ${body.slice(jsonStart)}`);
    return null;
  }
}

/**
 * Step 2 of the Socket.IO handshake.
 * POSTs "40" (EIO_MESSAGE + SIO_CONNECT) via HTTP polling.
 * Must be done BEFORE upgrading to WebSocket.
 */
export function connectViaPolling(baseUrl, sid) {
  const url  = `${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}`;
  const body = EIO_MESSAGE + SIO_CONNECT; // "40"
  return http.post(url, body, {
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    timeout: '5s',
  });
}

/**
 * Build the WebSocket URL for the upgrade step.
 * baseUrl can be https:// or http:// — we convert to wss:// or ws://
 */
export function wsUrl(baseUrl, sid) {
  const wsBase = baseUrl
    .replace('https://', 'wss://')
    .replace('http://',  'ws://');
  return `${wsBase}/socket.io/?EIO=4&transport=websocket&sid=${sid}`;
}

/**
 * Encode a Socket.IO event to send over the WebSocket.
 * encodeEvent('join_room', { roomId: null, ... })
 * → '42["join_room",{"roomId":null,...}]'
 */
export function encodeEvent(eventName, data) {
  return EIO_MESSAGE + SIO_EVENT + JSON.stringify([eventName, data]);
}

/**
 * Parse a raw WebSocket message from the server.
 * Returns one of:
 *   { kind: 'ping' }                       → server sent "2", reply with "3"
 *   { kind: 'connected' }                  → Socket.IO connected ("40")
 *   { kind: 'event', event: '...', data }  → a real Socket.IO event
 *   { kind: 'unknown', raw }               → something else
 */
export function parseFrame(raw) {
  if (!raw) return { kind: 'unknown', raw };

  // Engine.IO PING
  if (raw === EIO_PING) return { kind: 'ping' };

  // Engine.IO probe responses
  if (raw === '3probe') return { kind: 'probe_ack' };

  // Must start with EIO_MESSAGE ('4') to carry a Socket.IO packet
  if (raw[0] !== EIO_MESSAGE) return { kind: 'unknown', raw };

  const sioType = raw[1];

  // Socket.IO CONNECT confirmation
  if (sioType === SIO_CONNECT) return { kind: 'connected' };

  // Socket.IO EVENT
  if (sioType === SIO_EVENT) {
    try {
      const payload = JSON.parse(raw.slice(2));
      return { kind: 'event', event: payload[0], data: payload[1] };
    } catch (_) {
      return { kind: 'unknown', raw };
    }
  }

  return { kind: 'unknown', raw };
}
