import React, { forwardRef, useMemo } from "react";
import PropTypes from "prop-types";

/**
 * PlayerStatCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Visual, shareable snapshot of a player's stats. Rendered with an opaque
 * background (not the translucent .glass-card) so it rasterizes correctly
 * when captured to a PNG via html-to-image for sharing.
 *
 * Used in two places:
 *   - LeaderboardPage  (variant="leaderboard", optional rank/totalPlayers)
 *   - GameOverScreen   (variant="victory", shown only after a win)
 *
 * Forwards its ref to the outermost node so callers can pass it straight to
 * html-to-image's toPng()/toBlob().
 */
const QUOTES = [
  "Outsmarting the average, one number at a time.",
  "Precision beats luck. Mostly.",
  "I read minds. Well, averages.",
  "Somewhere between genius and a lucky guess.",
  "The numbers don't lie. I just predict them better.",
  "Eliminating opponents, one good guess at a time.",
];

function pickQuote(seed) {
  const n = Math.abs(Math.round(seed)) % QUOTES.length;
  return QUOTES[n];
}

const PlayerStatCard = forwardRef(function PlayerStatCard(
  { name, avatar, level, stats, variant = "leaderboard", rank, totalPlayers },
  ref
) {
  const s = stats || {};

  const quote = useMemo(
    () => pickQuote((s.gamesWon || 0) * 3 + (level || 0) + (name ? name.length : 0)),
    [s.gamesWon, level, name]
  );

  const isChampion = rank === 1;
  const onFire = (s.currentStreak || 0) >= 3;

  let badge = null;
  if (isChampion) {
    badge = { emoji: "🏆", label: "Champion", className: "bg-amber-500/20 text-amber-300 border-amber-500/40" };
  } else if (variant === "victory") {
    badge = { emoji: "✅", label: "Just Won", className: "bg-green-500/20 text-green-300 border-green-500/40" };
  } else if (onFire) {
    badge = { emoji: "🔥", label: "On Fire", className: "bg-red-500/20 text-red-300 border-red-500/40" };
  }

  const tiles = [
    { label: "Wins", value: s.gamesWon ?? 0 },
    { label: "Round Wins", value: s.roundWins ?? 0 },
    { label: "Best Streak", value: s.bestStreak ?? 0 },
    { label: "Win Rate", value: `${s.winRate ?? 0}%` },
    { label: "Games", value: s.gamesPlayed ?? 0 },
    { label: "Badges", value: `${s.achievementsUnlocked ?? 0}/${s.achievementsTotal ?? 0}` },
  ];

  return (
    <div
      ref={ref}
      data-testid="player-stat-card"
      className="w-full max-w-sm rounded-2xl overflow-hidden bg-numwit-gradient border border-white/10 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <span className="font-extrabold text-white/90 text-sm">Numwit</span>
        </div>
        {badge && (
          <span className={`text-[10px] font-bold uppercase tracking-wide border rounded-full px-3 py-1 ${badge.className}`}>
            {badge.emoji} {badge.label}
          </span>
        )}
      </div>

      {/* Identity row */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-cyan-500 p-0.5 shrink-0">
          <div className="w-full h-full rounded-2xl bg-[#16213e] flex items-center justify-center text-3xl">
            {avatar || "🎮"}
          </div>
        </div>
        <div>
          <p className="text-white font-extrabold text-lg leading-tight">{name || "Player"}</p>
          <p className="text-xs text-white/40">
            Level {level ?? 1}
            {rank ? ` · #${rank}${totalPlayers ? ` of ${totalPlayers} this week` : ""}` : ""}
          </p>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-white/10 bg-white/5 py-3 text-center">
            <p className="text-lg font-extrabold text-white font-mono">{t.value}</p>
            <p className="text-[9px] text-white/40 uppercase tracking-wide mt-0.5">{t.label}</p>
          </div>
        ))}
      </div>

      {/* Quote */}
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 mb-4">
        <p className="text-xs text-violet-200/80 italic text-center">&ldquo;{quote}&rdquo;</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-white/30">
        <span>numwit.gg</span>
        <span>Can you beat me?</span>
      </div>
    </div>
  );
});

PlayerStatCard.propTypes = {
  name: PropTypes.string,
  avatar: PropTypes.string,
  level: PropTypes.number,
  stats: PropTypes.shape({
    gamesPlayed: PropTypes.number,
    gamesWon: PropTypes.number,
    roundWins: PropTypes.number,
    winRate: PropTypes.number,
    currentStreak: PropTypes.number,
    bestStreak: PropTypes.number,
    achievementsUnlocked: PropTypes.number,
    achievementsTotal: PropTypes.number,
  }),
  variant: PropTypes.oneOf(["leaderboard", "victory"]),
  rank: PropTypes.number,
  totalPlayers: PropTypes.number,
};

export default PlayerStatCard;
