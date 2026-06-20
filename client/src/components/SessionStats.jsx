import React from "react";
import PropTypes from "prop-types";

/**
 * SessionStats
 * ─────────────────────────────────────────────────────────────────────────────
 * Compact per-player stats panel computed from history[].
 * Shown on GameOverScreen.
 *
 * Props:
 *   history    {Array}  — from NumwitRuleContext
 *   mySocketId {string} — user's socketId
 */
export default function SessionStats({ history, mySocketId }) {
  if (!history || history.length === 0) return null;

  let roundsPlayed = 0;
  let wins = 0;
  let totalPenalty = 0;
  let closestDiff = Infinity;
  let exactMatches = 0;

  history.forEach((r) => {
    roundsPlayed++;
    const iWon = r.winnerIds?.includes(mySocketId);
    if (iWon) wins++;
    else totalPenalty += r.exactMatch ? 2 : 1;

    if (r.exactMatch && iWon) exactMatches++;

    const mySubmission = r.submissions?.find((s) => s.socketId === mySocketId);
    const isInvalid = r.invalidSubmissions?.some((s) => s.socketId === mySocketId);
    if (mySubmission && !isInvalid && r.target != null) {
      const diff = Math.abs(mySubmission.number - r.target);
      if (diff < closestDiff) closestDiff = diff;
    }
  });

  const winRate = roundsPlayed > 0 ? Math.round((wins / roundsPlayed) * 100) : 0;

  const stats = [
    { label: "Rounds", value: roundsPlayed },
    { label: "Wins", value: wins, color: wins > 0 ? "text-green-600" : "text-gray-700" },
    { label: "Win Rate", value: `${winRate}%`, color: winRate >= 50 ? "text-green-600" : "text-gray-700" },
    { label: "Penalties", value: totalPenalty, color: totalPenalty > 0 ? "text-red-500" : "text-gray-700" },
    { label: "Closest", value: closestDiff === Infinity ? "—" : closestDiff.toFixed(2) },
    ...(exactMatches > 0 ? [{ label: "Exact!", value: exactMatches, color: "text-yellow-600" }] : []),
  ];

  return (
    <div className="w-full">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Your Session
      </p>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="bg-gray-50 rounded-xl p-2 text-center">
            <p className={`text-lg font-bold ${s.color || "text-gray-800"}`}>{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

SessionStats.propTypes = {
  history: PropTypes.array,
  mySocketId: PropTypes.string,
};
