/**
 * titles.js — a personal title for every player at game over, from how they
 * actually played this game ("The Contrarian — lowest pick in 4 of 6 rounds").
 * Players screenshot and argue about these; they go on the game-over screen,
 * the text share and the image card.
 *
 * Input is the game's round_result payloads (history) and the game_over data.
 * Everyone gets exactly one title: the first rule that matches, in TITLE order.
 */

export const TITLES = {
  mind_reader:  { name: "The Mind Reader",   icon: "🎯" },
  lone_wolf:    { name: "The Lone Wolf",     icon: "🐺" },
  mathematician:{ name: "The Mathematician", icon: "🧮" },
  contrarian:   { name: "The Contrarian",    icon: "🧊" },
  romantic:     { name: "The Last Romantic", icon: "💘" },
  anchor:       { name: "The Anchor",        icon: "⚓" },
  chaos:        { name: "The Chaos Agent",   icon: "🌀" },
  comeback:     { name: "The Comeback Kid",  icon: "🔥" },
  strategist:   { name: "The Strategist",    icon: "👑" },
  wildcard:     { name: "The Wildcard",      icon: "🎢" },
  steady:       { name: "The Steady Hand",   icon: "🐢" },
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Everything we need about one player's game, from the round history. */
function profile(id, history, gameOver) {
  const rounds = (history || []).filter((r) => (r.submissions || []).some((s) => s.socketId === id));
  const picks = [];
  let wins = 0;
  let exactWins = 0;
  let lowest = 0;
  let voided = 0;
  let comeback = false;
  let duelFromBehind = null; // true/false once the final duel starts

  (history || []).forEach((r, i) => {
    const mine = (r.submissions || []).find((s) => s.socketId === id);
    if (!mine) return;
    const before = (i > 0 && history[i - 1].points) || {};
    const won = (r.winnerIds || []).includes(id);
    if (won) {
      wins += 1;
      if (r.exactMatch) exactWins += 1;
      if ((before[id] || 0) >= 4) comeback = true;
    }
    if (typeof mine.number !== "number") return;
    picks.push(mine.number);

    const invalid = (r.invalidSubmissions || []).some((s) => s.socketId === id);
    if (invalid) voided += 1;

    const valid = (r.submissions || []).filter((s) => typeof s.number === "number"
      && !(r.invalidSubmissions || []).some((x) => x.socketId === s.socketId));
    if (!invalid && valid.length >= 2 && mine.number <= Math.min(...valid.map((s) => s.number))) lowest += 1;

    if (duelFromBehind === null && (r.submissions || []).length === 2) {
      const opp = r.submissions.find((s) => s.socketId !== id);
      duelFromBehind = !!opp && (before[id] || 0) > (before[opp.socketId] || 0);
    }
  });

  return {
    played: rounds.length,
    picks,
    wins,
    exactWins,
    lowest,
    voided,
    comeback,
    duelFromBehind: !!duelFromBehind,
    wonGame: gameOver?.winnerSocketId === id,
  };
}

/**
 * Titles for every player: { [socketId]: { id, name, icon, reason } }.
 * players: [{ socketId }] · history: round_result payloads · gameOver: { winnerSocketId }
 */
export function computeTitles(players, history, gameOver) {
  const ids = (players || []).map((p) => p.socketId);
  const stats = {};
  ids.forEach((id) => { stats[id] = profile(id, history, gameOver); });
  const mostWins = Math.max(0, ...ids.map((id) => stats[id].wins));

  const out = {};
  ids.forEach((id) => {
    const s = stats[id];
    const count = (fn) => s.picks.filter(fn).length;
    const hundreds = count((n) => n === 100);
    const middles = count((n) => n >= 45 && n <= 55);
    const spread = s.picks.length ? Math.max(...s.picks) - Math.min(...s.picks) : 0;

    const rules = [
      ["mind_reader", s.exactWins >= 1, `Hit the target exactly${s.exactWins > 1 ? ` ${s.exactWins} times` : ""}`],
      ["lone_wolf", s.wonGame && s.duelFromBehind, "Won the final duel from behind"],
      ["mathematician", !s.wonGame && s.wins > 0 && s.wins === mostWins, `Most round wins (${s.wins}) — but not the game`],
      ["contrarian", s.played >= 3 && s.lowest * 2 >= s.played, `Lowest pick in ${s.lowest} of ${s.played} rounds`],
      ["romantic", hundreds >= 3, `Picked 100 ${plural(hundreds, "time")}`],
      ["anchor", middles >= 3, `Picked near 50 in ${plural(middles, "round")}`],
      ["chaos", s.voided >= 2, `${plural(s.voided, "pick")} wiped out as duplicates`],
      ["comeback", s.comeback, "Won a round on 4 penalty points"],
      ["strategist", s.wonGame, `Last mind standing with ${plural(s.wins, "round win")}`],
      ["wildcard", spread >= 50, `Picks ranged from ${Math.min(...s.picks)} to ${Math.max(...s.picks)}`],
      ["steady", true, s.picks.length ? `Stayed between ${Math.min(...s.picks)} and ${Math.max(...s.picks)}` : "Kept their cards close"],
    ];
    const [key, , reason] = rules.find(([, hit]) => hit);
    out[id] = { id: key, ...TITLES[key], reason };
  });
  return out;
}
