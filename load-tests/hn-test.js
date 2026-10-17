/**
 * hn-test.js — a Show HN day, compressed into ~25 minutes.
 *   steady 150 people (90 solo, 38 public-room, 22 just browsing), then a
 *   spike to 300 for 3 minutes, back to 150, then down.
 *
 *   k6 run -e BASE_URL=https://numwit.prajvex.com hn-test.js --summary-export results/hn-summary.json
 *
 * Thresholds are for runs from India (~250 ms round trip to Fly iad): they
 * catch a struggling server, not normal network distance. Compare with the
 * smoke test's idle numbers — what matters is how much worse it gets under load.
 */
import { baseUrl, playGame, browse } from './utils/game.js';

const BASE = baseUrl();

// -e QUICK=1 → a 5-minute rehearsal at a fifth of the load (to check the setup)
const QUICK = __ENV.QUICK === '1';
const m = (min) => (QUICK ? `${min * 12}s` : `${min}m`);
const n = (vus) => (QUICK ? Math.max(1, Math.round(vus / 5)) : vus);

// Shape: ramp 5m → hold 10m → spike 1m → hold 3m → back 2m → down 2m
const shape = (steady, spike) => [
  { duration: m(5), target: n(steady) },
  { duration: m(10), target: n(steady) },
  { duration: m(1), target: n(spike) },
  { duration: m(3), target: n(spike) },
  { duration: m(2), target: n(steady) },
  { duration: m(2), target: 0 },
];

export const options = {
  scenarios: {
    solo:   { executor: 'ramping-vus', startVUs: 0, stages: shape(90, 180), exec: 'solo', gracefulRampDown: '30s' },
    public: { executor: 'ramping-vus', startVUs: 0, stages: shape(38, 75), exec: 'publicRoom', gracefulRampDown: '30s' },
    browse: { executor: 'ramping-vus', startVUs: 0, stages: shape(22, 45), exec: 'visitor', gracefulRampDown: '10s' },
  },
  thresholds: {
    pick_ack_ms: ['p(95)<800', 'p(99)<2000'],
    round_result_ms: ['p(95)<1000'],
    first_round_ms: ['p(95)<5000'],          // solo starts at once; public rooms may wait for bots
    connect_fail_rate: ['rate<0.03'],
    pick_accepted_rate: ['rate>0.98'],
    'http_req_duration{page:stats}': ['p(95)<1000'],
    'http_req_duration{page:leaderboard}': ['p(95)<1500'],
    'http_req_failed': ['rate<0.01'],
    games_completed: [QUICK ? 'count>5' : 'count>100'],
  },
};

export function solo() { playGame(BASE, { kind: 'solo', label: 'hn' }); }
export function publicRoom() { playGame(BASE, { kind: 'public', label: 'hnpub', thinkMin: 4, thinkMax: 18, maxMinutes: 8 }); }
export function visitor() { browse(BASE); }
