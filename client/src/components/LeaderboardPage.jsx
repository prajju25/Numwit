import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { useUser } from "../contexts/UserContext";
import ShareCardModal from "./ShareCardModal";

const PER_PAGE = 10;

function useLB() {
  const [board, setBoard]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetch("/api/leaderboard?limit=50")
      .then((r) => r.json())
      .then((d) => { setBoard(d.leaderboard || []); setLoading(false); })
      .catch(() => { setError("Couldn't load leaderboard. Try again."); setLoading(false); });
  }, []);

  return { board, loading, error };
}

function Medal({ rank }) {
  if (rank === 1) return <span className="text-yellow-400 font-black text-base">🥇</span>;
  if (rank === 2) return <span className="text-slate-300 font-black text-base">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 font-black text-base">🥉</span>;
  return <span className="text-white/40 text-sm font-semibold">{rank}</span>;
}

function WeekRange() {
  const now   = new Date();
  const start = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const fmt   = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return <span>{fmt(start)} – {fmt(now)}</span>;
}

export default function LeaderboardPage({ onBack }) {
  const { board, loading, error } = useLB();
  const { user, deviceId }        = useUser();
  const [page, setPage]           = useState(1);
  const [shareData, setShareData] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(board.length / PER_PAGE));
  const offset     = (page - 1) * PER_PAGE;
  const pageData   = board.slice(offset, offset + PER_PAGE);

  const isMe = (entry) =>
    user && entry.name === user.name && entry.avatar === user.avatar;

  // board is fetched with limit=50 — if we got fewer rows than that, this IS
  // the full weekly field, so "#rank of N this week" is accurate. If the
  // field is larger than 50, we don't know the true total, so omit it
  // rather than show a number we can't back up.
  const exactWeeklyTotal = board.length < 50 ? board.length : null;

  const handleShare = async (rank) => {
    if (!deviceId || shareLoading) return;
    setShareLoading(true);
    try {
      const res = await fetch(`/api/player/${deviceId}/card`);
      const data = await res.json();
      if (res.ok) {
        setShareData({
          player: { name: data.name, avatar: data.avatar, level: data.level, stats: data },
          rank,
          totalPlayers: exactWeeklyTotal,
        });
      }
    } catch (_) {
      // Best-effort — no toast wiring here yet; the share button just stays
      // clickable and the user can try again.
    } finally {
      setShareLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center px-4 py-10 sm:py-16 animate-fadeIn">

      {/* ── Back button ───────────────────────────────────────────────────── */}
      <div className="w-full max-w-4xl mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          ← Back to Home
        </button>
      </div>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="w-full max-w-4xl text-center mb-8 space-y-2">
        <div className="text-5xl mb-2">🏆</div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-yellow-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Weekly Leaderboard
          </span>
        </h1>
        <p className="text-sm text-white/40">
          Top players this week · <WeekRange />
        </p>
        {user && (
          <p className="text-xs text-white/30">
            Your rows are <span className="text-violet-400 font-semibold">highlighted</span>
          </p>
        )}
      </div>

      {/* ── Loading / error ───────────────────────────────────────────────── */}
      {loading && (
        <div className="text-white/40 animate-pulse mt-16 text-lg">Loading rankings…</div>
      )}
      {error && (
        <div className="text-red-400 mt-16 glass-card p-6 text-center max-w-sm">{error}</div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {!loading && !error && board.length === 0 && (
        <div className="glass-card p-10 text-center text-white/40 max-w-sm">
          No games played this week yet. Be the first!
        </div>
      )}

      {!loading && !error && board.length > 0 && (
        <div className="w-full max-w-5xl glass-card overflow-hidden">
          {/* scrollable wrapper for narrow screens */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[700px]">
              <thead>
                {/* Group header row */}
                <tr className="border-b border-white/5">
                  <th colSpan={3} className="py-2" />
                  <th
                    colSpan={3}
                    className="py-2 text-center text-xs font-bold tracking-widest uppercase text-cyan-400 border-b-2 border-cyan-500/40"
                  >
                    This Week
                  </th>
                  <th
                    colSpan={3}
                    className="py-2 text-center text-xs font-bold tracking-widest uppercase text-white/30 border-b-2 border-white/10"
                  >
                    All Time
                  </th>
                </tr>
                {/* Column names */}
                <tr className="border-b border-white/10">
                  <th className="py-3 px-3 text-left text-[10px] uppercase tracking-widest text-white/30 w-10">#</th>
                  <th className="py-3 px-3 text-left text-[10px] uppercase tracking-widest text-white/30">Player</th>
                  <th className="py-3 px-3 text-center text-[10px] uppercase tracking-widest text-white/30">Level</th>
                  <th className="py-3 px-3 text-center text-[10px] uppercase tracking-widest text-cyan-400/60">Games Played</th>
                  <th className="py-3 px-3 text-center text-[10px] uppercase tracking-widest text-cyan-400/60">Games Won</th>
                  <th className="py-3 px-3 text-center text-[10px] uppercase tracking-widest text-cyan-400/60">Round Wins</th>
                  <th className="py-3 px-3 text-center text-[10px] uppercase tracking-widest text-white/20">Games Played</th>
                  <th className="py-3 px-3 text-center text-[10px] uppercase tracking-widest text-white/20">Games Won</th>
                  <th className="py-3 px-3 text-center text-[10px] uppercase tracking-widest text-white/20">Round Wins</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((entry, i) => {
                  const rank = offset + i + 1;
                  const me   = isMe(entry);
                  return (
                    <tr
                      key={entry.id || rank}
                      className={[
                        "border-b border-white/5 transition-colors",
                        me
                          ? "bg-violet-500/10 border-l-2 border-l-violet-500"
                          : "hover:bg-white/[0.03]",
                      ].join(" ")}
                    >
                      {/* Rank */}
                      <td className="py-3 px-3 text-center">
                        <Medal rank={rank} />
                      </td>

                      {/* Player */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg leading-none">{entry.avatar || "🎮"}</span>
                          <span className={`font-semibold ${me ? "text-violet-300" : "text-white"}`}>
                            {entry.name || "?"}
                          </span>
                          {me && (
                            <span className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5 font-bold">
                              You
                            </span>
                          )}
                          {me && (
                            <button
                              onClick={() => handleShare(rank)}
                              disabled={shareLoading}
                              className="text-[10px] bg-white/8 text-white/60 border border-white/15 rounded-full px-2 py-0.5 font-bold hover:bg-white/15 hover:text-white transition-all disabled:opacity-40"
                            >
                              {shareLoading ? "…" : "Share"}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Level */}
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/10 text-sm font-bold text-white/80">
                          {entry.level ?? 1}
                        </span>
                      </td>

                      {/* This-week stats */}
                      <td className="py-3 px-3 text-center text-white/70 font-medium">{entry.weekGamesPlayed ?? 0}</td>
                      <td className="py-3 px-3 text-center">
                        <span className={entry.weekGamesWon > 0 ? "text-cyan-400 font-bold" : "text-white/40"}>
                          {entry.weekGamesWon ?? 0}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={entry.weekRoundWins > 0 ? "text-violet-400 font-bold" : "text-white/40"}>
                          {entry.weekRoundWins ?? 0}
                        </span>
                      </td>

                      {/* All-time stats */}
                      <td className="py-3 px-3 text-center text-white/30 text-xs">{entry.allTimeGamesPlayed ?? 0}</td>
                      <td className="py-3 px-3 text-center text-white/30 text-xs">{entry.allTimeGamesWon ?? 0}</td>
                      <td className="py-3 px-3 text-center text-white/30 text-xs">{entry.allTimeRoundWins ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ──────────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 py-4 border-t border-white/5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-sm px-4 py-2 rounded-xl bg-white/8 border border-white/10 text-white/60
                           hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:cursor-default transition-all"
              >
                ‹ Prev
              </button>
              <span className="text-white/40 text-sm min-w-[90px] text-center">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="text-sm px-4 py-2 rounded-xl bg-white/8 border border-white/10 text-white/60
                           hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:cursor-default transition-all"
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Footer CTA ────────────────────────────────────────────────────── */}
      <div className="mt-10 text-center space-y-2">
        <button
          onClick={onBack}
          className="btn-primary px-8 py-3 text-sm font-bold"
        >
          ▶ Play Now
        </button>
        <p className="text-xs text-white/25">Rankings reset every 7 days</p>
      </div>

      {shareData && (
        <ShareCardModal
          player={shareData.player}
          rank={shareData.rank}
          totalPlayers={shareData.totalPlayers}
          variant="leaderboard"
          onClose={() => setShareData(null)}
        />
      )}
    </div>
  );
}

LeaderboardPage.propTypes = {
  onBack: PropTypes.func.isRequired,
};
