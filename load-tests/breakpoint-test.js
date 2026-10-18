/**
 * breakpoint-test.js — keep adding solo players until something gives.
 *   0 → 800 players over 20 minutes; stops early (abortOnFail) once picks
 *   take > 2 s for 5% of players or > 10% can't connect. The VU count at
 *   that moment is the real ceiling of one machine.
 *
 *   k6 run -e BASE_URL=https://numwit.prajvex.com breakpoint-test.js --summary-export results/breakpoint-summary.json
 *
 * Note: fly.toml caps one machine at 600 connections (hard_limit), so past
 * ~600 players Fly itself starts turning connections away — expected.
 */
import { baseUrl, playGame } from './utils/game.js';

const BASE = baseUrl();

export const options = {
  scenarios: {
    climb: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ duration: '20m', target: 800 }, { duration: '1m', target: 0 }],
      exec: 'solo',
      gracefulRampDown: '20s',
    },
  },
  thresholds: {
    pick_ack_ms: [{ threshold: 'p(95)<2000', abortOnFail: true, delayAbortEval: '1m' }],
    connect_fail_rate: [{ threshold: 'rate<0.10', abortOnFail: true, delayAbortEval: '1m' }],
  },
};

export function solo() { playGame(BASE, { kind: 'solo', label: 'bp', thinkMin: 3, thinkMax: 12 }); }
