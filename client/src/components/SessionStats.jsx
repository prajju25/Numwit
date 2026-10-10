import React from "react";
import PropTypes from "prop-types";

const CHART_W = 320;
const CHART_H = 110;
const PAD_X = 12;
const PAD_Y = 12;

/**
 * Target per round (cyan line) against my pick (gold dot = round won,
 * violet ring = round lost). Y axis is fitted to the values shown.
 */
function TargetTrend({ points }) {
  if (points.length < 2) return null;
  const values = points.flatMap((p) => [p.target, p.pick].filter((v) => typeof v === "number"));
  const lo = Math.max(0, Math.floor(Math.min(...values) - 5));
  const hi = Math.min(100, Math.ceil(Math.max(...values) + 5));
  const span = Math.max(1, hi - lo);
  const x = (i) => PAD_X + (i * (CHART_W - PAD_X * 2)) / (points.length - 1);
  const y = (v) => PAD_Y + (1 - (v - lo) / span) * (CHART_H - PAD_Y * 2);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.target).toFixed(1)}`).join(" ");
  const first = points[0], last = points[points.length - 1];

  return (
    <figure className="m-0">
      <div className="flex gap-3 text-[11px] text-[#8F95B8] mb-1.5">
        <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-cyan-400" />target</span>
        <span className="flex items-center gap-1"><span className="w-[7px] h-[7px] rounded-full bg-amber-400" />your pick (won)</span>
        <span className="flex items-center gap-1"><span className="w-[7px] h-[7px] rounded-full border-[1.5px] border-violet-400" />your pick</span>
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${CHART_W} ${CHART_H + 14}`}
        role="img"
        aria-label={`Target moved from ${first.target.toFixed(1)} in round ${first.round} to ${last.target.toFixed(1)} in round ${last.round}`}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={CHART_W} y1={PAD_Y + f * (CHART_H - PAD_Y * 2)} y2={PAD_Y + f * (CHART_H - PAD_Y * 2)} stroke="rgba(255,255,255,.06)" />
        ))}
        <polyline className="nw-draw" points={line} fill="none" stroke="#22D3EE" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (typeof p.pick === "number" ? (
          p.won
            ? <circle key={i} cx={x(i)} cy={y(p.pick)} r="4.5" fill="#FBBF24" />
            : <circle key={i} cx={x(i)} cy={y(p.pick)} r="4.5" fill="none" stroke="#A78BFA" strokeWidth="2" />
        ) : null))}
        <text x={x(0)} y={CHART_H + 12} fill="#6E749A" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle">R{first.round}</text>
        <text x={x(points.length - 1)} y={CHART_H + 12} fill="#6E749A" fontFamily="JetBrains Mono" fontSize="9" textAnchor="middle">R{last.round}</text>
      </svg>
    </figure>
  );
}

TargetTrend.propTypes = { points: PropTypes.array.isRequired };

/**
 * SessionStats
 * ─────────────────────────────────────────────────────────────────────────────
 * Compact per-player stats panel computed from history[], plus a target
 * trend chart. Shown on GameOverScreen.
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
  const trend = [];

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
    if (typeof r.target === "number") {
      trend.push({ round: r.round ?? roundsPlayed, target: r.target, pick: mySubmission?.number, won: !!iWon });
    }
  });

  const winRate = roundsPlayed > 0 ? Math.round((wins / roundsPlayed) * 100) : 0;

  const stats = [
    { label: "Rounds", value: roundsPlayed },
    { label: "Wins", value: wins, color: wins > 0 ? "text-emerald-300" : "text-white" },
    { label: "Win Rate", value: `${winRate}%`, color: winRate >= 50 ? "text-emerald-300" : "text-white" },
    { label: "Penalties", value: totalPenalty, color: totalPenalty > 0 ? "text-red-300" : "text-white" },
    { label: "Closest", value: closestDiff === Infinity ? "—" : closestDiff.toFixed(2), color: "text-amber-300" },
    ...(exactMatches > 0 ? [{ label: "Exact!", value: exactMatches, color: "text-amber-300" }] : []),
  ];

  return (
    <section className="glass-card rounded-[20px] p-4 flex flex-col gap-3.5">
      <h2 className="font-display text-base font-bold m-0">Your Session</h2>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-black/25 px-2.5 py-2">
            <p className={`nums text-xl font-extrabold m-0 ${s.color || "text-white"}`}>{s.value}</p>
            <p className="text-[11px] text-[#8F95B8] m-0">{s.label}</p>
          </div>
        ))}
      </div>
      <TargetTrend points={trend} />
    </section>
  );
}

SessionStats.propTypes = {
  history: PropTypes.array,
  mySocketId: PropTypes.string,
};
