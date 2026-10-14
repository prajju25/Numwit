import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import BrandMark from "./BrandMark";
import useInstallPrompt from "../hooks/useInstallPrompt";

const STATS_POLL_MS = 10000;

function useLiveStats() {
  const [stats, setStats] = useState({ activePlayers: 0, gamesPlayedToday: 0, activeRooms: 0 });

  useEffect(() => {
    const fetchStats = () => {
      fetch("/api/stats")
        .then((r) => r.json())
        .then((d) => setStats(d))
        .catch(() => {});
    };
    fetchStats();
    const id = setInterval(fetchStats, STATS_POLL_MS);
    return () => clearInterval(id);
  }, []);

  return stats;
}

const RULES = [
  {
    title: "Pick in secret",
    body: "Everyone locks a number 0–100 before the timer runs out.",
    tint: "bg-violet-500/15 text-violet-300",
    icon: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  },
  {
    title: "Target = 80% of the average",
    body: "Closest wins the round. Everyone else takes a penalty point.",
    tint: "bg-cyan-400/15 text-cyan-300",
    icon: <><path d="M3 12h18M12 4v16" /><path d="M8 8l-3 4 3 4" /></>,
  },
  {
    title: "Last one standing",
    body: "5 penalty points and you're out. Last mind standing wins the game.",
    tint: "bg-red-400/15 text-red-300",
    icon: <><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" fill="currentColor" /></>,
  },
];

const ADVANCED_RULES = [
  { title: "No copying.", body: "If 3+ players pick the same number, those picks are void." },
  { title: "Exact hit.", body: "Land exactly on the target and everyone else takes +2." },
  { title: "1v1 duel.", body: "100 beats 0, 0 beats 1, 1 beats 100. Otherwise the 80% rule holds." },
];

// Demo round: picks average to 41.6, target 33.28, closest pick is 34.
const DEMO_PICKS = [
  { avatar: "😎", n: 18, lift: false },
  { avatar: "👾", n: 30, lift: true },
  { avatar: "🦊", n: 34, lift: false, win: true },
  { avatar: "🐸", n: 52, lift: false },
  { avatar: "👻", n: 74, lift: false },
];

/** Looping 8-second explainer: pick → average → ×0.8 → closest wins. */
function DemoRound() {
  return (
    <section
      aria-label="Demo: five players pick, the average is 41.6, the target is 33.3, and 34 wins"
      className="glass-card rounded-3xl p-4 sm:p-6"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="label-muted">Live round · demo</span>
        <span className="nums text-[11px] text-[#8F95B8]">5 players</span>
      </div>

      <div className="relative h-[150px] sm:h-[220px] mx-1.5 sm:mx-3" aria-hidden="true">
        <div className="nw-demo-avg absolute top-6 sm:top-9 bottom-[30px] sm:bottom-9 border-l-2 border-dashed border-white/75" style={{ left: "41.6%" }}>
          <span className="nums absolute -top-5 left-1.5 whitespace-nowrap text-[11px] sm:text-[13px] font-bold">avg 41.6</span>
        </div>
        <div className="nw-demo-tgt absolute top-1 bottom-[30px] sm:bottom-9 w-0">
          <div className="absolute -left-[1.5px] top-5 bottom-0 w-[3px] rounded bg-cyan-400" style={{ boxShadow: "0 0 12px 2px rgba(34,211,238,.7)" }} />
          <span className="nums absolute top-0 right-1.5 whitespace-nowrap text-[11px] sm:text-[13px] font-extrabold text-cyan-300">×0.8 = 33.3</span>
        </div>
        <div className="absolute left-0 right-0 bottom-[30px] sm:bottom-9 h-1 rounded bg-gradient-to-r from-violet-500/60 to-cyan-400/60" />
        <div className="nums absolute left-0 right-0 bottom-2 flex justify-between text-[10px] sm:text-xs text-[#6E749A]">
          <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
        </div>
        {DEMO_PICKS.map((p, i) => (
          <div
            key={p.n}
            className="nw-demo-pin absolute flex flex-col items-center"
            style={{
              left: `calc(${p.n}% - 16px)`,
              bottom: p.lift ? "74px" : "40px",
              animationDelay: `${i * 0.12}s`,
            }}
          >
            <div className={`${p.win ? "nw-demo-win" : ""} w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#1A1E38] border-[1.5px] border-white/20 flex items-center justify-center text-base sm:text-xl`}>
              {p.avatar}
            </div>
            <span className={`nums text-[10px] sm:text-xs mt-0.5 ${p.win ? "text-amber-200 font-bold" : "text-[#B4B9D6]"}`}>{p.n}</span>
          </div>
        ))}
        <span
          className="nw-demo-label absolute whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold text-amber-200 border border-amber-400/50 bg-amber-400/15"
          style={{ left: "calc(34% + 20px)", bottom: "104px" }}
        >
          Closest — wins
        </span>
      </div>

      <ol className="grid grid-cols-4 gap-1.5 mt-3 list-none p-0 m-0">
        {["Pick", "Average", "× 0.8", "Closest"].map((label, i) => (
          <li key={label} className="rounded-xl border border-white/[0.08] bg-white/[0.03] py-1.5 text-center text-[11px] font-bold text-[#B4B9D6] leading-tight">
            <span className="nums block text-[10px] opacity-70">0{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function LandingPage({ onPlay, onLeaderboard }) {
  const stats = useLiveStats();
  const { canInstall, promptInstall } = useInstallPrompt();
  const hasStats = stats.activePlayers > 0 || stats.gamesPlayedToday > 0;

  return (
    <div className="min-h-screen w-full flex flex-col items-center">
      <div className="w-full max-w-6xl px-4 sm:px-8 lg:px-12">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between gap-3 py-3.5 sm:py-5">
          <span className="flex items-center gap-2.5">
            <BrandMark size={46} />
            <span className="font-display text-xl sm:text-2xl font-bold">Numwit</span>
          </span>
          <div className="flex items-center gap-2">
            {stats.activePlayers > 0 && (
              <span className="flex items-center gap-1.5 h-7 sm:h-9 px-2.5 sm:px-3.5 rounded-full text-xs sm:text-[13px] font-semibold text-emerald-200 bg-emerald-400/10 border border-emerald-400/25">
                <span className="nw-live w-[7px] h-[7px] rounded-full bg-emerald-400" />
                {stats.activePlayers} online
              </span>
            )}
            {canInstall && (
              <button
                onClick={promptInstall}
                className="h-11 px-3 sm:px-4 rounded-xl flex items-center gap-2 bg-violet-500/15 border border-violet-400/45 hover:bg-violet-500/25 transition text-violet-100 text-sm font-bold"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
                Install app
              </button>
            )}
            <button
              onClick={onLeaderboard}
              aria-label="Leaderboard"
              className="h-11 px-3 sm:px-4 rounded-xl flex items-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 transition text-amber-300"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></svg>
              <span className="hidden sm:inline text-sm font-bold text-white">Leaderboard</span>
            </button>
          </div>
        </header>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-14 pt-4 sm:pt-10 lg:pt-16 pb-6 animate-fadeIn">
          <div className="flex-1 min-w-0 flex flex-col gap-4 sm:gap-5">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.14em] text-violet-400">
              A real-time mind game · 3–8 players
            </span>
            <h2 className="font-display m-0 font-bold text-[40px] sm:text-6xl lg:text-7xl leading-[1.02] tracking-[-0.035em]">
              Don&apos;t guess the number.<br />
              <span className="text-gradient">Guess everyone else.</span>
            </h2>
            <p className="m-0 text-base sm:text-lg leading-relaxed text-[#B4B9D6] max-w-xl">
              Everyone picks 0–100 at once. The target is{" "}
              <strong className="text-cyan-300 font-bold">80% of the average</strong>. Closest pick wins the round.
            </p>
            <div className="hidden lg:flex flex-wrap gap-3 mt-2">
              <button onClick={onPlay} className="btn-primary h-[60px] px-8 rounded-2xl inline-flex items-center gap-2.5 text-lg font-extrabold">
                <PlayIcon />
                Play now — it&apos;s free
              </button>
            </div>
          </div>
          <div className="flex-1 min-w-0 w-full">
            <DemoRound />
          </div>
        </section>

        {/* ── CTA (mobile/tablet) ─────────────────────────────────────────── */}
        <section className="lg:hidden flex flex-col gap-2.5 pt-1">
          <button onClick={onPlay} className="btn-primary h-[58px] rounded-2xl flex items-center justify-center gap-2.5 text-[17px] font-extrabold">
            <PlayIcon />
            Play now — it&apos;s free
          </button>
        </section>
        <p className="text-center lg:text-left mt-2.5 text-xs sm:text-sm text-[#8F95B8]">
          No signup. Pick a name, then Public, Private or vs Bots.
        </p>

        {/* ── Live stats ──────────────────────────────────────────────────── */}
        {hasStats && (
          <section className="grid grid-cols-3 gap-2 sm:gap-3 mt-6">
            <StatTile value={stats.activePlayers} label="online now" />
            <StatTile value={stats.gamesPlayedToday} label="games today" />
            <StatTile value={stats.activeRooms} label={`room${stats.activeRooms !== 1 ? "s" : ""} active`} />
          </section>
        )}

        {/* ── Rules ───────────────────────────────────────────────────────── */}
        <section className="pt-10 sm:pt-16">
          <h2 className="font-display text-[22px] sm:text-3xl font-bold m-0 mb-4">Three rules. Infinite mind games.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-4">
            {RULES.map((rule) => (
              <div key={rule.title} className="glass-card p-4 sm:p-5 flex md:flex-col gap-3.5 items-start transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-400/45">
                <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${rule.tint}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{rule.icon}</svg>
                </div>
                <div>
                  <p className="font-bold text-[15px] sm:text-base m-0">{rule.title}</p>
                  <p className="text-[13px] sm:text-sm leading-relaxed text-[#A3A8C7] mt-0.5 mb-0">{rule.body}</p>
                </div>
              </div>
            ))}
          </div>
          <details className="glass-card mt-2.5 sm:mt-4 px-4 group">
            <summary className="list-none cursor-pointer min-h-[48px] flex items-center justify-between text-sm font-bold text-violet-300 [&::-webkit-details-marker]:hidden">
              Advanced rules
              <svg className="transition-transform group-open:rotate-180" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </summary>
            <div className="pb-4 flex flex-col gap-2.5 text-[13px] leading-relaxed text-[#A3A8C7]">
              {ADVANCED_RULES.map((r) => (
                <p key={r.title} className="m-0"><strong className="text-white">{r.title}</strong> {r.body}</p>
              ))}
            </div>
          </details>
        </section>

        {/* ── Footer CTA ──────────────────────────────────────────────────── */}
        <footer className="py-10 sm:py-14 flex flex-col items-center gap-2.5">
          <button onClick={onPlay} className="text-violet-300 font-bold hover:text-violet-200 transition-colors text-[15px] min-h-[44px]">
            Ready? Enter the game →
          </button>
          <p className="text-xs text-[#6E749A] m-0">No account needed. Ever.</p>
        </footer>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
    </svg>
  );
}

function StatTile({ value, label }) {
  return (
    <div className="glass-card rounded-2xl px-3 py-3">
      <div className="nums text-xl sm:text-2xl font-bold text-white">{(value || 0).toLocaleString()}</div>
      <div className="text-[11px] sm:text-xs text-[#8F95B8] mt-0.5">{label}</div>
    </div>
  );
}

StatTile.propTypes = {
  value: PropTypes.number,
  label: PropTypes.string.isRequired,
};

LandingPage.propTypes = {
  onPlay:        PropTypes.func.isRequired,
  onLeaderboard: PropTypes.func.isRequired,
};
