import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

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

const HOW_IT_WORKS = [
  { icon: "🎯", title: "Pick a number", body: "Everyone simultaneously picks a number 0–100. No copying — think for yourself." },
  { icon: "📐", title: "Target = 80% of average", body: "The winning target is 80% of the average of all valid picks." },
  { icon: "🏆", title: "Closest wins", body: "The player closest to the target wins the round. Others get a penalty point." },
  { icon: "💀", title: "Last one standing", body: "5 penalty points = eliminated. The last player standing wins." },
  { icon: "🔄", title: "1v1 secret rule", body: "In a duel, 100 beats 0, 0 beats 1, and 1 beats 100 — rock-paper-scissors style. The normal 80% rule still applies for any other numbers." },
  { icon: "⚡", title: "No copying allowed", body: "If 3+ players pick the same number, those picks are invalid. So you can't just copy others — think for yourself." },
];

export default function LandingPage({ onPlay, onLeaderboard }) {
  const stats = useLiveStats();

  return (
    <div className="min-h-screen w-full flex flex-col items-center px-4 py-16 sm:py-24">

      {/* ── Hero ────────────────────────────────────────────────────────────────── */}
      <div className="max-w-xl w-full text-center space-y-6 animate-fadeIn">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="text-7xl sm:text-8xl drop-shadow-2xl select-none">🧠</div>
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
              Numwit
            </span>
          </h1>
          <p className="text-xl sm:text-2xl text-white/80 font-medium">
            The number game that rewards the average genius.
          </p>
          <p className="text-white/50 text-sm sm:text-base max-w-sm mx-auto leading-relaxed">
            Real-time · 3–8 players · No download · Always free
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-2">
          <button
            onClick={onPlay}
            className="btn-primary inline-flex items-center gap-3 text-lg px-10 py-4"
          >
            <span>▶</span>
            <span>Play Now — Free</span>
          </button>
          <button
            onClick={onLeaderboard}
            className="btn-secondary inline-flex items-center gap-2 text-base px-6 py-4"
          >
            <span>🏆</span>
            <span>Leaderboard</span>
          </button>
        </div>

        {/* Live stats pill */}
        {(stats.activePlayers > 0 || stats.gamesPlayedToday > 0) && (
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {stats.activePlayers > 0 && (
              <span className="flex items-center gap-1.5 glass-card-sm px-3 py-1.5 text-sm text-white/70">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {stats.activePlayers} online
              </span>
            )}
            {stats.gamesPlayedToday > 0 && (
              <span className="glass-card-sm px-3 py-1.5 text-sm text-white/70">
                🎮 {stats.gamesPlayedToday} games today
              </span>
            )}
            {stats.activeRooms > 0 && (
              <span className="glass-card-sm px-3 py-1.5 text-sm text-white/70">
                🏠 {stats.activeRooms} room{stats.activeRooms !== 1 ? "s" : ""} active
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── How it works ────────────────────────────────────────────────────────── */}
      <div className="mt-20 max-w-2xl w-full animate-fadeIn">
        <p className="section-heading text-center mb-8">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.title} className="glass-card p-5 flex gap-4 items-start hover:border-violet-500/30 transition-all duration-300">
              <span className="text-3xl shrink-0">{step.icon}</span>
              <div>
                <p className="font-bold text-white text-sm">{step.title}</p>
                <p className="text-xs text-white/55 mt-1 leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

      </div>

      {/* ── Footer CTA ──────────────────────────────────────────────────────────── */}
      <div className="mt-12 text-center animate-fadeIn space-y-3">
        <button
          onClick={onPlay}
          className="text-violet-400 font-bold hover:text-violet-300 transition-colors text-sm"
        >
          Ready? Enter the game →
        </button>
        <p className="text-xs text-white/30">No account needed. Ever.</p>
      </div>
    </div>
  );
}

LandingPage.propTypes = {
  onPlay:        PropTypes.func.isRequired,
  onLeaderboard: PropTypes.func.isRequired,
};
