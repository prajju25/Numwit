/**
 * shareText.js
 * Wordle-style text summary of a finished game — pastes cleanly into
 * WhatsApp, Discord or X with no image.
 *
 *   Numwit 🧠 🥈 2nd of 4 · won 3/7 rounds
 *   🟩⬛🟨🟩🎯⬛🟩
 *   Closest: 0.4 off the target
 *   https://numwit.prajvex.com
 *
 * One square per round:
 *   🎯 exact hit · 🟩 won · 🟨 lost but within 3 of the target ·
 *   ⬛ lost · 🟥 duplicate pick (void) · ⬜ no pick
 */
import { SITE_URL } from "../hooks/usePageMeta";

const MEDALS = ["🥇", "🥈", "🥉"];
const NEAR_MISS = 3;
const PER_LINE = 10;

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
}

/** The square for one round from this player's point of view. */
export function roundSquare(result, mySocketId) {
  const mine = (result.submissions || []).find((s) => s.socketId === mySocketId);
  if (!mine || typeof mine.number !== "number") return "⬜";
  if ((result.invalidSubmissions || []).some((s) => s.socketId === mySocketId)) return "🟥";
  if ((result.winnerIds || []).includes(mySocketId)) {
    return result.exactMatch ? "🎯" : "🟩";
  }
  if (typeof result.target === "number" && Math.abs(mine.number - result.target) <= NEAR_MISS) return "🟨";
  return "⬛";
}

/** Rounds this player took part in (not the ones after they were knocked out). */
export function playedRounds(history, mySocketId) {
  return (history || []).filter((r) => (r.submissions || []).some((s) => s.socketId === mySocketId));
}

/**
 * history:     round_result payloads for this game, in order
 * placement:   1-based finishing position · playerCount: players in the game
 */
export function buildShareText({ history, mySocketId, placement, playerCount, url = SITE_URL }) {
  const rounds = playedRounds(history, mySocketId);
  const won = rounds.filter((r) => (r.winnerIds || []).includes(mySocketId)).length;

  const roundsWon = `won ${won}/${rounds.length} round${rounds.length === 1 ? "" : "s"}`;
  const head = placement
    ? `Numwit 🧠 ${MEDALS[placement - 1] || "🏁"} ${ordinal(placement)} of ${playerCount} · ${roundsWon}`
    : `Numwit 🧠 ${roundsWon}`;

  const squares = rounds.map((r) => roundSquare(r, mySocketId));
  const grid = [];
  for (let i = 0; i < squares.length; i += PER_LINE) grid.push(squares.slice(i, i + PER_LINE).join(""));

  let closest = null;
  rounds.forEach((r) => {
    const mine = (r.submissions || []).find((s) => s.socketId === mySocketId);
    const invalid = (r.invalidSubmissions || []).some((s) => s.socketId === mySocketId);
    if (mine && typeof mine.number === "number" && typeof r.target === "number" && !invalid) {
      const d = Math.abs(mine.number - r.target);
      if (closest === null || d < closest) closest = d;
    }
  });
  const closestLine = closest === null ? null
    : closest < 0.05 ? "Closest: dead on the target 🎯"
    : `Closest: ${(Math.round(closest * 10) / 10).toFixed(1)} off the target`;

  return [head, ...grid, closestLine, url].filter(Boolean).join("\n");
}
