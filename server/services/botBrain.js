/**
 * botBrain.js
 * ─────────────────────────────────────────────────────────────────────────────
 * How bots choose their numbers. Pure functions (inject `rng` for tests).
 *
 * Fair play: bots decide at the START of a round from previous rounds only
 * (game.pickHistory) — they never see anyone's pick for the current round.
 *
 * 3+ players — opponent modelling + simulated best response:
 *   1. Predict each other player's pick as a probability distribution:
 *      - no history yet → a realistic round-1 mix (naive ~50, level-1 ~33,
 *        level-2 ~22, a few near-zero "Nash" players);
 *      - with history → how that player relates to the previous target
 *        (their personal undercut ratio) and how consistent they are.
 *   2. For every candidate 0..100, simulate a few hundred rounds from those
 *      distributions using the real rules (duplicate picks are void, closest
 *      to multiplier × average wins) and estimate the chance of winning.
 *   3. Choose among the best candidates with difficulty-dependent noise.
 *
 * Duels (2 players) are rock-paper-scissors on {0, 1, 100}:
 *   1 beats any other number and 100 · 0 beats 1 and any other number ·
 *   100 beats 0. Bots track which move the opponent favours (recency
 *   weighted) and counter it, mixing in the unexploitable uniform strategy.
 *
 * Difficulty: casual · sharp · ruthless, or adaptive (default) — which slides
 * between them each round from the score: tougher while humans lead,
 * gentler while they trail, so games stay close.
 */

const DIFFICULTIES = ["adaptive", "casual", "sharp", "ruthless"];

// Strength parameters at each fixed level; adaptive interpolates between them.
//   smart    — chance a bot plays the simulated best response (else a
//              "human-like" heuristic around the previous target)
//   topK     — how many of the best candidates it randomises among
//   duelSmart— chance a duel bot plays its counter-move (else uniform 0/1/100,
//              or for casual sometimes an ordinary number)
const LEVELS = {
  casual:   { smart: 0.15, topK: 12, duelSmart: 0.2, samples: 120 },
  sharp:    { smart: 0.45, topK: 6, duelSmart: 0.55, samples: 200 },
  ruthless: { smart: 0.85, topK: 3, duelSmart: 0.8,  samples: 300 },
};
const LEVEL_ORDER = ["casual", "sharp", "ruthless"];

function normalizeDifficulty(d) {
  return DIFFICULTIES.indexOf(d) === -1 ? "adaptive" : d;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Box–Muller normal sample. */
function gaussian(rng, mean, sd) {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Difficulty ────────────────────────────────────────────────────────────────

/**
 * Strength on a 0 (casual) … 2 (ruthless) scale. Adaptive starts between
 * casual and sharp (0.6)
 * and moves half a level per penalty point of lead: if the humans have fewer
 * points than the bots, bots get sharper; if they have more, bots ease off.
 */
function strengthFor(difficulty, game, humanIds, botIds) {
  const d = normalizeDifficulty(difficulty);
  if (d !== "adaptive") return LEVEL_ORDER.indexOf(d);
  const pts = (game && game.points) || {};
  const avg = (ids) => (ids.length ? ids.reduce((s, id) => s + (pts[id] || 0), 0) / ids.length : 0);
  const humanLead = avg(botIds) - avg(humanIds); // > 0 → humans winning
  return clamp(0.6 + 0.5 * humanLead, 0, 2);
}

/** Interpolated parameters for a 0..2 strength. */
function paramsFor(strength) {
  const s = clamp(strength, 0, 2);
  const lo = LEVEL_ORDER[Math.floor(s)];
  const hi = LEVEL_ORDER[Math.min(2, Math.ceil(s))];
  const t = s - Math.floor(s);
  const a = LEVELS[lo];
  const b = LEVELS[hi];
  const mix = (k) => a[k] + (b[k] - a[k]) * t;
  return {
    smart: mix("smart"),
    topK: Math.max(1, Math.round(mix("topK"))),
    duelSmart: mix("duelSmart"),
    samples: Math.round(mix("samples")),
  };
}

// ── Opponent models ───────────────────────────────────────────────────────────

/** Round-1 picks of people who haven't played a round yet. */
function sampleFirstRound(rng) {
  const r = rng();
  if (r < 0.32) return gaussian(rng, 50, 11);   // naive / middle
  if (r < 0.66) return gaussian(rng, 34, 7);    // one step: 0.8 × ~45
  if (r < 0.88) return gaussian(rng, 23, 6);    // two steps
  return rng() * 12;                            // near the Nash answer (0)
}

/**
 * Build a sampler for one player's next pick from their history.
 * history: [{ picks: {socketId: n}, target: number|null }] (oldest first)
 */
function playerModel(socketId, history, multiplier) {
  const rounds = history.filter((h) => typeof h.target === "number");
  const lastTarget = rounds.length ? rounds[rounds.length - 1].target : null;
  if (lastTarget === null) return { sample: sampleFirstRound };

  // Personal ratio: pick(t) / target(t-1)
  const ratios = [];
  for (let i = 1; i < history.length; i++) {
    const prevTarget = history[i - 1].target;
    const pick = history[i].picks && history[i].picks[socketId];
    if (typeof prevTarget === "number" && prevTarget > 0.5 && typeof pick === "number") {
      ratios.push(pick / prevTarget);
    }
  }

  let center;
  let sd;
  if (ratios.length) {
    // Recent behaviour counts double
    let wSum = 0;
    let rSum = 0;
    ratios.forEach((r, i) => { const w = i === ratios.length - 1 ? 2 : 1; wSum += w; rSum += r * w; });
    const mean = rSum / wSum;
    const variance = ratios.reduce((s, r) => s + (r - mean) * (r - mean), 0) / ratios.length;
    center = mean * lastTarget;
    sd = Math.max(1.5, Math.sqrt(variance) * lastTarget + 2);
  } else {
    // Seen one round: most people undercut the last target a little
    center = multiplier * lastTarget + 1;
    sd = Math.max(2.5, lastTarget * 0.18);
  }

  const lastPick = history[history.length - 1].picks && history[history.length - 1].picks[socketId];
  return {
    sample(rng) {
      // Some players stubbornly repeat themselves
      if (typeof lastPick === "number" && rng() < 0.12) return lastPick + gaussian(rng, 0, 1);
      return gaussian(rng, center, sd);
    },
  };
}

// ── 3+ players: simulated best response ───────────────────────────────────────

/**
 * Estimated win probability for every candidate 0..100.
 * othersModels: samplers for everyone except this bot.
 */
function winProbabilities(othersModels, opts, rng) {
  const { multiplier, duplicateRule, samples } = opts;
  const n = othersModels.length + 1;
  const wins = new Array(101).fill(0);

  for (let s = 0; s < samples; s++) {
    const picks = othersModels.map((m) => clamp(Math.round(m.sample(rng)), 0, 100));
    const counts = {};
    picks.forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
    const sumOthers = picks.reduce((a, b) => a + b, 0);

    for (let c = 0; c <= 100; c++) {
      if (duplicateRule && counts[c]) continue; // my pick would be void
      const target = multiplier * ((sumOthers + c) / n);
      const mine = Math.abs(c - target);
      let beaten = false;
      for (let i = 0; i < picks.length; i++) {
        const p = picks[i];
        if (duplicateRule && counts[p] > 1) continue; // their pick is void
        if (Math.abs(p - target) < mine) { beaten = true; break; }
      }
      if (!beaten) wins[c]++;
    }
  }
  return wins.map((w) => w / samples);
}

/** The pre-upgrade "human-like" pick: near the previous target (or 30-70 in round 1). */
function heuristicPick(game, rng) {
  const target = game && typeof game.target === "number" ? game.target : null;
  if (target === null) return rng() < 0.7 ? 30 + rng() * 40 : rng() * 100;
  return target + (rng() * 30 - 15);
}

// ── Duels ─────────────────────────────────────────────────────────────────────

const DUEL_MOVES = [0, 1, 100];
const moveOf = (n) => (n === 0 || n === 1 || n === 100 ? n : "other");
// Payoff for the bot playing `bot` against `opp`: +1 win, -1 loss, 0 replay
function duelPayoff(bot, opp) {
  if (bot === opp) return 0;
  if (bot === 0) return opp === 100 ? -1 : 1;     // 0 beats 1 and any other
  if (bot === 1) return opp === 0 ? -1 : 1;       // 1 beats 100 and any other
  return opp === 0 ? 1 : -1;                      // 100 beats only 0
}

function duelPick(opponentId, history, params, rng) {
  // Recency-weighted frequencies of the opponent's duel moves, with a prior
  const weights = { 0: 1, 1: 1, 100: 1, other: 1 };
  const duelRounds = history.filter((h) => h.duel);
  duelRounds.forEach((h, i) => {
    const pick = h.picks && h.picks[opponentId];
    if (typeof pick !== "number") return;
    weights[moveOf(pick)] += 1 + i * 0.6; // later rounds count more
  });
  // A player who keeps winning with the same move tends to repeat it
  const last = duelRounds.length ? duelRounds[duelRounds.length - 1] : null;
  const lastPick = last && last.picks ? last.picks[opponentId] : undefined;
  if (typeof lastPick === "number") weights[moveOf(lastPick)] += 2;

  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const prob = (m) => weights[m] / total;

  if (rng() < params.duelSmart) {
    let best = 0;
    let bestEv = -Infinity;
    DUEL_MOVES.forEach((b) => {
      const ev = [0, 1, 100, "other"].reduce((s, o) => s + prob(o) * duelPayoff(b, o), 0);
      if (ev > bestEv) { bestEv = ev; best = b; }
    });
    return best;
  }
  // Casual bots sometimes miss the trick entirely and play an ordinary number
  if (params.duelSmart < 0.4 && rng() < 0.5) return 2 + Math.round(rng() * 30);
  return DUEL_MOVES[Math.floor(rng() * 3) % 3];
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Choose this round's number for every active bot.
 *   game        — room.game (turnOrder, eliminatedPlayers, points, settings,
 *                 target, pickHistory)
 *   isBot(id)   — bot test
 *   rng         — () => [0,1)
 * Returns { [botSocketId]: number }, distinct across bots when the duplicate
 * rule applies.
 */
function chooseBotNumbers(game, isBot, rng = Math.random) {
  const eliminated = game.eliminatedPlayers || [];
  const active = (game.turnOrder || []).filter((id) => eliminated.indexOf(id) === -1);
  const botIds = active.filter(isBot);
  const humanIds = active.filter((id) => !isBot(id));
  const settings = game.settings || {};
  const multiplier = settings.targetMultiplier != null ? settings.targetMultiplier : 0.8;
  const duplicateRule = settings.duplicateRuleEnabled !== false && active.length >= 3;
  const history = game.pickHistory || [];
  const params = paramsFor(strengthFor(settings.botDifficulty, game, humanIds, botIds));
  const out = {};

  if (active.length === 2) {
    botIds.forEach((id) => {
      const opponent = active.find((x) => x !== id);
      // Bot vs bot: both would read the same history, pick the same counter
      // and tie (void) round after round — play the even 0/1/100 mix instead.
      out[id] = isBot(opponent)
        ? DUEL_MOVES[Math.floor(rng() * 3) % 3]
        : duelPick(opponent, history, params, rng);
    });
    return out;
  }

  const models = {};
  active.forEach((id) => { models[id] = playerModel(id, history, multiplier); });
  const taken = new Set();

  botIds.forEach((id) => {
    let pick;
    if (rng() < params.smart) {
      const others = active.filter((x) => x !== id).map((x) => models[x]);
      const probs = winProbabilities(others, { multiplier, duplicateRule, samples: params.samples }, rng);
      const ranked = probs
        .map((p, n) => ({ n, p }))
        .filter((c) => !(duplicateRule && taken.has(c.n)))
        .sort((a, b) => b.p - a.p || a.n - b.n)
        .slice(0, params.topK);
      pick = ranked[Math.floor(rng() * ranked.length)].n;
    } else {
      pick = clamp(Math.round(heuristicPick(game, rng)), 0, 100);
      // Nudge off a teammate's number so bots don't void each other
      while (duplicateRule && taken.has(pick)) pick = pick >= 100 ? pick - 1 : pick + 1;
    }
    taken.add(pick);
    out[id] = pick;
  });
  return out;
}

module.exports = {
  DIFFICULTIES,
  normalizeDifficulty,
  chooseBotNumbers,
  // exported for tests / tuning
  strengthFor,
  paramsFor,
  playerModel,
  winProbabilities,
  duelPick,
  duelPayoff,
};
