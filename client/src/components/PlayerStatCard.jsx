import React, { forwardRef, useMemo } from "react";
import PropTypes from "prop-types";
import BrandMark from "./BrandMark";

/**
 * PlayerStatCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Visual, shareable snapshot of a player's stats — 4:5 portrait so the PNG
 * export lands at 1080×1350 (Instagram/feed friendly). Rendered with opaque
 * backgrounds (not the translucent .glass-card) so it rasterizes correctly
 * when captured to a PNG via html-to-image for sharing.
 *
 * Used in two places:
 *   - LeaderboardPage  (variant="leaderboard", optional rank/totalPlayers)
 *   - GameOverScreen   (variant="victory", shown only after a win)
 *
 * Forwards its ref to the outermost node so callers can pass it straight to
 * html-to-image's toPng()/toBlob(). Elements with .nw-sheen are decorative
 * motion and are filtered out of the export by ShareCardModal.
 */
const QUOTES = [
  "Outsmarting the average, one number at a time.",
  "Precision beats luck. Mostly.",
  "I read minds. Well, averages.",
  "Somewhere between genius and a lucky guess.",
  "The numbers don't lie. I just predict them better.",
  "Eliminating opponents, one good guess at a time.",
];

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

function pickQuote(seed) {
  const n = Math.abs(Math.round(seed)) % QUOTES.length;
  return QUOTES[n];
}

const BADGES = {
  champion: { label: "Champion", cls: "bg-amber-400/20 border-amber-400/60 text-amber-100", frame: "rgba(251,191,36,.55)", tint: "#FCD34D" },
  victory:  { label: "Just Won", cls: "bg-emerald-400/15 border-emerald-400/55 text-emerald-100", frame: "rgba(52,211,153,.35)", tint: "#A7F3D0" },
  fire:     { label: "On Fire",  cls: "bg-orange-400/15 border-orange-400/55 text-orange-100", frame: "rgba(251,146,60,.4)", tint: "#FED7AA" },
};

const PlayerStatCard = forwardRef(function PlayerStatCard(
  { name, avatar, level, stats, variant = "leaderboard", rank, totalPlayers, title },
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
  if (isChampion) badge = BADGES.champion;
  else if (variant === "victory") badge = BADGES.victory;
  else if (onFire) badge = BADGES.fire;

  const progress = Math.max(0, Math.min(1, typeof s.levelProgress === "number" ? s.levelProgress : 1));
  const frame = badge?.frame || "rgba(167,139,250,.35)";
  const heroTint = badge?.tint || "#C4B5FD";

  const tiles = [
    { label: "round wins", value: s.roundWins ?? 0 },
    { label: "best streak", value: s.bestStreak ?? 0, cls: "text-amber-300" },
    { label: "games", value: s.gamesPlayed ?? 0 },
    { label: "badges", value: `${s.achievementsUnlocked ?? 0}/${s.achievementsTotal ?? 0}`, cls: "text-violet-200" },
  ];

  return (
    <div
      ref={ref}
      data-testid="player-stat-card"
      className="relative w-full max-w-[360px] aspect-[4/5] rounded-[24px] overflow-hidden px-[22px] pt-[22px] pb-5 flex flex-col text-[#F1F2FA]"
      style={{
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        background:
          "radial-gradient(70% 55% at 0% 0%, rgba(124,58,237,.55) 0%, rgba(124,58,237,0) 70%)," +
          "radial-gradient(60% 50% at 100% 100%, rgba(6,182,212,.35) 0%, rgba(6,182,212,0) 70%)," +
          "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)," +
          "linear-gradient(160deg, #141033 0%, #0A0C1B 55%, #06121A 100%)",
        backgroundSize: "auto, auto, 18px 18px, 18px 18px, auto",
      }}
    >
      <div className="nw-sheen absolute inset-0 pointer-events-none" aria-hidden="true" />
      <div className="absolute inset-0 rounded-[24px] pointer-events-none" style={{ border: `1.5px solid ${frame}` }} aria-hidden="true" />

      {/* Header */}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrandMark size={30} />
          <span className="font-display font-bold text-[15px]">Numwit</span>
        </div>
        {badge && (
          <span className={`text-[10px] font-extrabold uppercase tracking-[0.12em] border rounded-full px-2.5 py-1 ${badge.cls}`}>
            {badge.label}
          </span>
        )}
      </div>

      {/* Identity row */}
      <div className="relative flex items-center gap-3.5 mt-5">
        <div className="relative w-[68px] h-[68px] shrink-0">
          <svg width="68" height="68" viewBox="0 0 68 68" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <defs>
              <linearGradient id="nw-card-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#A78BFA" /><stop offset="1" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
            <circle cx="34" cy="34" r={RING_R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4" />
            <circle cx="34" cy="34" r={RING_R} fill="none" stroke="url(#nw-card-ring)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - progress)} />
          </svg>
          <div className="absolute inset-[8px] rounded-full flex items-center justify-center text-[28px]"
            style={{ background: "radial-gradient(circle at 35% 30%, #2D3260, #14172F)" }}>
            {avatar || "🎮"}
          </div>
          <span className="nums absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-px rounded-md border-2 border-[#0E0F24] text-[10px] font-extrabold whitespace-nowrap"
            style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}>
            LV {level ?? 1}
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] truncate m-0">{name || "Player"}</p>
          {title ? (
            // This game's title (victory card) — level is on the avatar badge
            <p className="text-[12px] font-extrabold text-amber-200 mt-1.5 mb-0 truncate">{title.icon} {title.name}</p>
          ) : (
            <p className="text-[12px] font-semibold text-[#C4B5FD] mt-1.5 mb-0">
              Level {level ?? 1}
              {rank ? ` · #${rank}${totalPlayers ? ` of ${totalPlayers} this week` : ""}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* Hero metric */}
      <div className="relative flex items-end justify-between mt-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#A9AED0] m-0">Win rate</p>
          <p className="nums text-[68px] font-extrabold leading-[0.9] tracking-[-0.06em] pr-[0.12em] m-0"
            style={{ background: `linear-gradient(180deg,#FFFFFF 20%,${heroTint} 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            {`${s.winRate ?? 0}%`}
          </p>
        </div>
        <div className="text-right pb-1.5">
          <p className="nums text-[22px] font-extrabold m-0">{s.gamesWon ?? 0}</p>
          <p className="text-[11px] text-[#A9AED0] m-0">wins</p>
          {(s.currentStreak || 0) >= 2 && (
            <p className="text-[11px] font-bold text-orange-300 mt-0.5 mb-0">{s.currentStreak}-win streak</p>
          )}
        </div>
      </div>

      {/* Number-line signature: teaches the rule to whoever sees the post */}
      <div className="relative mt-3.5 h-7" aria-hidden="true">
        <div className="absolute inset-x-0 top-3 h-[3px] rounded bg-gradient-to-r from-violet-500/70 to-cyan-400/70" />
        <div className="absolute top-1 h-5 border-l-2 border-dashed border-white/60" style={{ left: "41.6%" }} />
        <div className="absolute top-0 h-[26px] w-[3px] -ml-[1.5px] rounded bg-cyan-400" style={{ left: "33.3%", boxShadow: "0 0 10px 2px rgba(34,211,238,.8)" }} />
        <div className="absolute top-[7px] w-3 h-3 -ml-1.5 rounded-full bg-amber-400" style={{ left: "34%", boxShadow: "0 0 10px 3px rgba(251,191,36,.7)" }} />
      </div>
      <p className="relative text-[11px] text-[#A9AED0] m-0">
        Pick 0–100 · target is <strong className="text-cyan-300">80% of the average</strong>
      </p>

      {/* Stat tiles */}
      <div className="relative grid grid-cols-4 gap-1.5 mt-3.5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-white/10 bg-white/[0.05] px-2 py-2">
            <p className={`nums text-[17px] font-extrabold m-0 ${t.cls || "text-white"}`}>{t.value}</p>
            <p className="text-[9px] text-[#A9AED0] m-0">{t.label}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="relative mt-auto flex items-end justify-between gap-3">
        <p className="text-[11px] italic leading-snug text-[#D4D7EE] max-w-[55%] m-0">&ldquo;{quote}&rdquo;</p>
        <div className="text-right">
          <p className="font-display text-[13px] font-bold m-0">Can you beat me?</p>
          <p className="nums text-[11px] font-bold text-cyan-300 m-0">numwit.prajvex.com</p>
        </div>
      </div>
    </div>
  );
});

PlayerStatCard.propTypes = {
  // This game's title (services/titles.js), shown on the victory card
  title: PropTypes.shape({ name: PropTypes.string, icon: PropTypes.string }),
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
    levelProgress: PropTypes.number,
  }),
  variant: PropTypes.oneOf(["leaderboard", "victory"]),
  rank: PropTypes.number,
  totalPlayers: PropTypes.number,
};

export default PlayerStatCard;
