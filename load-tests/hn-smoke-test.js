/**
 * hn-smoke-test.js — 5 fake players, 2 minutes. Run FIRST.
 * Proves the scripts and the server work end to end, and gives the "idle"
 * numbers (mostly network round trip) to compare the loaded runs against.
 *
 *   k6 run -e BASE_URL=https://numwit.prajvex.com hn-smoke-test.js
 */
import { baseUrl, playGame, browse } from './utils/game.js';

const BASE = baseUrl();

export const options = {
  scenarios: {
    players: { executor: 'constant-vus', vus: 4, duration: '2m', exec: 'player' },
    visitor: { executor: 'constant-vus', vus: 1, duration: '2m', exec: 'visitor' },
  },
  thresholds: {
    connect_fail_rate: ['rate==0'],
    pick_accepted_rate: ['rate>0.99'],
    checks: ['rate>0.99'],
  },
};

export function player() { playGame(BASE, { kind: 'solo', label: 'smoke', thinkMin: 2, thinkMax: 5, maxMinutes: 2 }); }
export function visitor() { browse(BASE); }
