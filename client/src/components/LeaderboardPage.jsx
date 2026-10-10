import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";
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

function WeekRange() {
  const now   = new Date();
  const start = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const fmt   = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return <span>{fmt(start)} – {fmt(now)}</span>;
}

/** Stats for the selected period. Ranking always follows the weekly order. */
function statsFor(entry, period) {
  return period === "week"
    ? { played: entry.weekGamesPlayed ?? 0, won: entry.weekGamesWon ?? 0, rounds: entry.weekRoundWins ?? 0 }
    : { played: entry.allTimeGamesPlayed ?? 0, won: entry.allTimeGamesWon ?? 0, rounds: entry.allTimeRoundWins ?? 0 };
}

function ShareIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}
ShareIcon.propTypes = { size: PropTypes.number };

const PODIUM = [
  // display order: 2nd, 1st, 3rd
  { rank: 2, card: "from-slate-300/15 to-slate-300/[0.03] border-slate-300/30 py-3.5", ring: "border-slate-300 w-[50px] h-[50px] text-2xl", tag: "text-slate-200" },
  { rank: 1, card: "from-amber-400/25 to-amber-400/[0.04] border-amber-400/50 pt-5 pb-4 shadow-[0_0_30px_-8px_rgba(251,191,36,0.5)]", ring: "border-amber-400 w-[60px] h-[60px] text-3xl", tag: "text-amber-200" },
  { rank: 3, card: "from-amber-700/20 to-amber-700/[0.03] border-amber-600/35 py-3", ring: "border-amber-600 w-[46px] h-[46px] text-[22px]", tag: "text-orange-300" },
];

export default function LeaderboardPage({ onBack }) {
  const { board, loading, error } = useLB();
  const { user, deviceId }        = useUser();
  const [page, setPage]           = useState(1);
  const [period, setPeriod]       = useState("week");
  const [shareData, setShareData] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(board.length / PER_PAGE));
  const offset     = (page - 1) * PER_PAGE;
  const pageData   = board.slice(offset, offset + PER_PAGE);
  // Page 1 leads with a podium for the top three; the list continues from #4.
  const podium     = page === 1 ? pageData.slice(0, 3) : [];
  const listRows   = page === 1 ? pageData.slice(3) : pageData;

  const isMe = (entry) =>
    user && entry.name === user.name && entry.avatar === user.avatar;

  const myIndex = board.findIndex(isMe);
  const myRank  = myIndex >= 0 ? myIndex + 1 : null;
  const meOnPage = myIndex >= offset && myIndex < offset + PER_PAGE;

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

  const shareButton = (rank, big = false) => (
    <button
      onClick={() => handleShare(rank)}
      disabled={shareLoading}
      className={twMerge(
        "inline-flex items-center gap-1.5 font-extrabold transition active:scale-95 disabled:opacity-40",
        big
          ? "h-11 px-4 rounded-xl bg-white text-[#2E1065] text-sm"
          : "h-8 px-2.5 rounded-full bg-violet-500/25 border border-violet-300/60 text-violet-50 text-xs"
      )}
    >
      <ShareIcon size={big ? 15 : 12} />
      {shareLoading ? "…" : big ? "Share card" : "Share"}
    </button>
  );

  return (
    <div className="min-h-screen w-full flex flex-col items-center px-4 pt-4 sm:pt-10 pb-0 animate-fadeIn">
      <div className="w-full max-w-3xl flex flex-col">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <button
          onClick={onBack}
          className="self-start min-h-[44px] flex items-center gap-2 text-sm text-[#A3A8C7] hover:text-white transition-colors"
        >
          ← Back to Home
        </button>
        <div className="flex items-end justify-between gap-3 mt-1">
          <h1 className="font-display text-[30px] sm:text-4xl font-bold m-0">Leaderboard</h1>
          <p className="text-xs text-[#8F95B8] m-0 pb-1.5">Last 7 days · <WeekRange /></p>
        </div>

        {/* ── Period tabs ───────────────────────────────────────────────── */}
        <div role="tablist" aria-label="Stats period" className="grid grid-cols-2 gap-1 p-1 mt-4 rounded-2xl bg-black/30 border border-white/[0.08]">
          {[{ id: "week", label: "This week" }, { id: "all", label: "All time" }].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={period === t.id}
              onClick={() => setPeriod(t.id)}
              className={twMerge(
                "h-10 rounded-xl text-sm font-bold transition-colors",
                period === t.id ? "bg-violet-600 text-white" : "text-[#A3A8C7] hover:text-white"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Loading / error / empty ───────────────────────────────────── */}
        {loading && (
          <div className="text-[#8F95B8] animate-pulse mt-16 text-lg text-center">Loading rankings…</div>
        )}
        {error && (
          <div className="text-red-300 mt-16 glass-card p-6 text-center">{error}</div>
        )}
        {!loading && !error && board.length === 0 && (
          <div className="glass-card mt-10 p-10 text-center text-[#A3A8C7]">
            No games played this week yet. Be the first!
          </div>
        )}

        {/* ── Podium ────────────────────────────────────────────────────── */}
        {podium.length > 0 && (
          <section className="grid grid-cols-3 gap-2 sm:gap-3 items-end mt-8">
            {PODIUM.map((slot) => {
              const entry = podium[slot.rank - 1];
              if (!entry) return <div key={slot.rank} />;
              const me = isMe(entry);
              const s = statsFor(entry, period);
              return (
                <div
                  key={slot.rank}
                  className={twMerge("nw-rise relative flex flex-col items-center gap-1.5 px-1.5 rounded-[18px] border bg-gradient-to-b", slot.card)}
                  style={{ animationDelay: `${slot.rank * 0.12}s` }}
                >
                  {slot.rank === 1 && (
                    <svg className="absolute -top-4 text-amber-400" width="30" height="24" viewBox="0 0 24 20" fill="currentColor" aria-hidden="true"><path d="M2 5l5 5 5-8 5 8 5-5-2 13H4L2 5z" /></svg>
                  )}
                  <span className={twMerge("font-display text-sm font-bold", slot.tag)}>#{slot.rank}</span>
                  <span className={twMerge("rounded-full bg-[#1A1E38] border-2 flex items-center justify-center", slot.ring)}>{entry.avatar || "🎮"}</span>
                  <span className={twMerge("text-[13px] font-bold max-w-full truncate", slot.rank === 1 ? "text-amber-100" : "text-white")}>{entry.name || "?"}</span>
                  {me && <span className="text-[10px] font-bold text-violet-200 bg-violet-500/25 border border-violet-400/40 rounded-full px-2">You</span>}
                  <span className="nums text-lg sm:text-[22px] font-extrabold text-white leading-none">{s.won}</span>
                  <span className="text-[10px] text-[#8F95B8] -mt-1">wins</span>
                  {me && <div className="mt-1">{shareButton(slot.rank)}</div>}
                </div>
              );
            })}
          </section>
        )}

        {/* ── List ──────────────────────────────────────────────────────── */}
        {!loading && !error && listRows.length > 0 && (
          <section className="glass-card rounded-[20px] overflow-hidden mt-4">
            <div className="flex px-3.5 py-2.5 label-muted border-b border-white/[0.07]">
              <span className="w-8">#</span>
              <span className="flex-1">Player</span>
              <span className="w-14 text-right">Rounds</span>
              <span className="w-12 text-right">Wins</span>
            </div>
            {listRows.map((entry, i) => {
              const rank = offset + (page === 1 ? 3 : 0) + i + 1;
              const me   = isMe(entry);
              const s    = statsFor(entry, period);
              return (
                <div
                  key={entry.id || rank}
                  className={twMerge(
                    "nw-rise flex items-center px-3.5 py-2.5 min-h-[56px] border-b border-white/5 transition-colors",
                    me ? "bg-violet-500/[0.16] nw-me-glow" : "hover:bg-white/[0.04]"
                  )}
                  style={{ animationDelay: `${0.05 * i}s` }}
                >
                  <span className="nums w-8 text-[13px] font-bold text-[#8F95B8]">{rank}</span>
                  <span className="flex-1 min-w-0 flex items-center gap-2.5">
                    <span className="text-xl leading-none">{entry.avatar || "🎮"}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className={twMerge("text-sm font-bold truncate", me ? "text-violet-100" : "text-white")}>
                          {entry.name || "?"}
                        </span>
                        {me && (
                          <span className="text-[10px] font-bold text-violet-200 bg-violet-500/25 border border-violet-400/40 rounded-full px-2 shrink-0">You</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-[#8F95B8]">Lv {entry.level ?? 1} · {s.played} games</span>
                      {me && <span className="block mt-1.5">{shareButton(rank)}</span>}
                    </span>
                  </span>
                  <span className="nums w-14 text-right text-[13px] text-violet-300">{s.rounds}</span>
                  <span className={twMerge("nums w-12 text-right text-[15px] font-extrabold", s.won > 0 ? "text-cyan-300" : "text-white/40")}>{s.won}</span>
                </div>
              );
            })}
          </section>
        )}

        {/* ── Pagination ────────────────────────────────────────────────── */}
        {!loading && !error && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-11 px-4 rounded-xl text-sm bg-white/5 border border-white/10 text-[#B4B9D6] hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-default transition-all"
            >
              ‹ Prev
            </button>
            <span className="text-[#8F95B8] text-sm min-w-[90px] text-center">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-11 px-4 rounded-xl text-sm bg-white/5 border border-white/10 text-[#B4B9D6] hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-default transition-all"
            >
              Next ›
            </button>
          </div>
        )}

        {/* ── Footer CTA ────────────────────────────────────────────────── */}
        <div className="mt-8 mb-6 text-center flex flex-col items-center gap-2">
          <button onClick={onBack} className="btn-primary h-12 px-8 rounded-2xl text-sm font-bold">
            ▶ Play Now
          </button>
          <p className="text-xs text-[#6E749A] m-0">Rankings cover the last 7 days</p>
        </div>
      </div>

      {/* ── Sticky "your rank" bar when your row is on another page ────── */}
      {myRank && !meOnPage && (
        <div className="sticky bottom-0 w-full max-w-3xl px-0 pt-4 pb-4"
          style={{ background: "linear-gradient(180deg, rgba(11,14,28,0), rgba(11,14,28,.95) 30%)" }}>
          <div className="nw-me-glow flex items-center gap-3 pl-3.5 pr-2.5 py-2.5 rounded-[18px] border border-violet-300/55"
            style={{ background: "linear-gradient(135deg, rgba(124,58,237,.35), rgba(34,211,238,.12))" }}>
            <span className="font-display text-[22px] font-bold text-violet-200">#{myRank}</span>
            <span className="text-2xl">{user.avatar}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-extrabold truncate">{user.name} (you)</span>
              <span className="block text-xs text-[#C7CBE6]">
                {statsFor(board[myIndex], period).won} wins · {statsFor(board[myIndex], period).rounds} round wins
              </span>
            </span>
            {shareButton(myRank, true)}
          </div>
        </div>
      )}

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
