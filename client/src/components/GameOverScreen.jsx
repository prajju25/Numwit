import React, { useState } from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";
import socket from "../socket";
import { useUser } from "../contexts/UserContext";
import { useNumwit } from "../contexts/NumwitRuleContext";
import SessionStats from "./SessionStats";
import RoundHistory from "./RoundHistory";
import LevelBadge from "./LevelBadge";
import ShareCardModal from "./ShareCardModal";
import { useGame } from "../contexts/GameContext";

const MEDALS = ["🥇", "🥈", "🥉"];
const CONFETTI = ["#FBBF24", "#8B5CF6", "#22D3EE", "#34D399", "#F472B6"];
// Podium column order on screen: 2nd, 1st, 3rd
const PODIUM_ORDER = [1, 0, 2];
const PODIUM_STYLE = [
  { h: "h-[100px]", box: "from-amber-400/35 to-amber-400/[0.06] border-amber-400/55 shadow-[0_0_28px_-6px_rgba(251,191,36,0.5)]", name: "text-amber-200 font-extrabold", avatar: "text-[34px]" },
  { h: "h-[72px]",  box: "from-slate-300/20 to-slate-300/[0.04] border-slate-300/30", name: "text-white font-bold", avatar: "text-[28px]" },
  { h: "h-[54px]",  box: "from-amber-700/25 to-amber-700/[0.04] border-amber-600/40", name: "text-white font-bold", avatar: "text-[26px]" },
];

/** Where the XP bar animates from/to (0–100), from the xp_update payload. */
function xpBarRange(xpData) {
  const to = Math.round(Math.max(0, Math.min(1, xpData.progress ?? 1)) * 100);
  const span = (xpData.xpNextLevel ?? 0) - (xpData.xpLevelStart ?? 0);
  const gainedPct = span > 0 ? (Math.max(0, xpData.xpGained || 0) / span) * 100 : 0;
  const from = xpData.levelUp ? 0 : Math.max(0, Math.round(to - gainedPct));
  return { from, to };
}

export default function GameOverScreen({ data, players }) {
  const { roomId, user, deviceId } = useUser();
  const { history, xpData, myLevel, newAchievements } = useNumwit();
  const { hostSocketId } = useGame();
  const winner = players?.find((p) => p.socketId === data?.winnerSocketId);
  const mySocketId = user?.socketId ?? socket.id;
  const iWon = data?.winnerSocketId === mySocketId;
  const isHost = mySocketId === hostSocketId;
  const disconnectReason = data?.reason === "opponent_disconnected";
  const [showHistory, setShowHistory] = useState(false);
  const [shareData, setShareData] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);

  const handleShare = async () => {
    if (!deviceId || shareLoading) return;
    setShareLoading(true);
    try {
      const res = await fetch(`/api/player/${deviceId}/card`);
      const cardData = await res.json();
      if (res.ok) {
        setShareData({
          name: cardData.name,
          avatar: cardData.avatar,
          level: cardData.level,
          stats: cardData,
        });
      }
    } catch (_) {
      // Best-effort — share button just stays available to retry.
    } finally {
      setShareLoading(false);
    }
  };

  const handleRestart = () => socket.emit("restart_game", { roomId });

  // Winner first, then fewest penalty points.
  const sorted = [...(players || [])].sort((a, b) => {
    if (a.socketId === data?.winnerSocketId) return -1;
    if (b.socketId === data?.winnerSocketId) return 1;
    const pa = data?.points?.[a.socketId] ?? 0;
    const pb = data?.points?.[b.socketId] ?? 0;
    return pa - pb;
  });
  const podium = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  const rounds = history?.length || 0;
  const myRoundWins = (history || []).filter((r) => r.winnerIds?.includes(mySocketId)).length;
  const xpRange = xpData ? xpBarRange(xpData) : null;

  return (
    <div className="relative w-full max-w-md mx-auto flex flex-col gap-4 animate-fadeIn">

      {/* Confetti */}
      {iWon && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-6 h-[360px] overflow-hidden">
          {Array.from({ length: 12 }, (_, i) => (
            <span
              key={i}
              className="nw-confetti"
              style={{ left: `${4 + i * 8}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i * 0.37) % 2.2}s`, width: i % 3 ? 8 : 6 }}
            />
          ))}
        </div>
      )}

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center text-center gap-2 pt-10">
        <div className="nw-pop relative w-[108px] h-[108px] mb-1">
          {iWon && (
            <div className="nw-halo absolute -inset-2.5 rounded-full opacity-90 blur-[1px]"
              style={{ background: "conic-gradient(from 0deg,#FBBF24,#F59E0B,#FDE68A,#8B5CF6,#FBBF24)" }} />
          )}
          <div className="absolute -inset-1 rounded-full bg-[#0B0E1C]" />
          <div className={twMerge(
            "absolute inset-0 rounded-full flex items-center justify-center text-[54px]",
            iWon ? "bg-[radial-gradient(circle_at_35%_30%,#2A2F55,#141831)]" : "bg-[#141831] border border-white/10"
          )}>
            {winner?.avatar || "🏁"}
          </div>
          {iWon && (
            <svg className="absolute -top-7 left-1/2 -ml-5 text-amber-400" width="40" height="32" viewBox="0 0 24 20" fill="currentColor" aria-hidden="true">
              <path d="M2 5l5 5 5-8 5 8 5-5-2 13H4L2 5z" />
            </svg>
          )}
        </div>
        {iWon && (
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300 m-0">Last mind standing</p>
        )}
        <h1 className={twMerge("font-display text-[44px] font-bold leading-none m-0", iWon ? "text-white" : "text-white/80")}>
          {iWon ? "You Won!" : "Game Over"}
        </h1>
        {!iWon && winner && (
          <p className="text-sm text-[#A3A8C7] m-0">
            <span className="text-amber-300 font-bold">🏆 Winner</span> · {winner.avatar} {winner.name}
          </p>
        )}
        {rounds > 0 && (
          <p className="text-sm text-[#A3A8C7] m-0">
            {rounds} round{rounds !== 1 ? "s" : ""} · {myRoundWins} round win{myRoundWins !== 1 ? "s" : ""}
          </p>
        )}
        {disconnectReason && (
          <p className="text-sm text-[#8F95B8] m-0">A player disconnected — game ended early.</p>
        )}
      </section>

      {/* ── XP ────────────────────────────────────────────────────────────── */}
      {xpData && (
        <section className={twMerge(
          "glass-card rounded-[18px] px-4 py-3.5 flex flex-col gap-2.5",
          xpData.levelUp && "border-violet-400/45"
        )}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {myLevel && <LevelBadge level={myLevel} />}
              {xpData.levelUp && (
                <span className="nw-pop text-[11px] font-extrabold px-2 py-0.5 rounded-full text-emerald-200 bg-emerald-400/15 border border-emerald-400/50" style={{ animationDelay: "2.2s" }}>
                  Level {xpData.level} reached!
                </span>
              )}
            </div>
            <span className="nums text-[15px] font-extrabold text-violet-200">
              {xpData.xpGained >= 0 ? "+" : ""}{xpData.xpGained} XP
            </span>
          </div>
          {xpRange && (
            <div className="h-2.5 rounded-full bg-white/[0.08] overflow-hidden" aria-hidden="true">
              <div
                className="nw-xp-fill h-full rounded-full bg-gradient-to-r from-violet-600 via-violet-400 to-cyan-300"
                style={{ "--xp-from": `${xpRange.from}%`, "--xp-to": `${xpRange.to}%`, width: `${xpRange.to}%`, boxShadow: "0 0 12px rgba(139,92,246,.7)" }}
              />
            </div>
          )}
        </section>
      )}

      {/* ── Share + play again ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        {iWon && (
          <button
            onClick={handleShare}
            disabled={shareLoading}
            className="group btn-gold relative flex items-center gap-3.5 px-4 py-3.5 text-left disabled:opacity-60"
          >
            <span aria-hidden="true" className="nw-tilt shrink-0 w-16 h-20 rounded-[10px] border border-white/30 flex flex-col items-center justify-center gap-1 shadow-[0_8px_18px_rgba(0,0,0,0.45)]"
              style={{ background: "linear-gradient(160deg,#1E1B4B,#0B0E1C)" }}>
              <span className="text-[22px]">{winner?.avatar}</span>
              <span className="w-8 h-[3px] rounded bg-gradient-to-r from-violet-500 to-cyan-400" />
            </span>
            <span className="flex-1">
              <span className="block text-lg">{shareLoading ? "Loading your stats…" : "Share your win"}</span>
              <span className="block text-[13px] font-semibold opacity-75">Your stat card is ready to post</span>
            </span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        )}

        {/* Play again — only host can trigger; others wait */}
        {isHost ? (
          <button
            onClick={handleRestart}
            className={twMerge("h-[54px] rounded-2xl text-base font-extrabold flex items-center justify-center gap-2", iWon ? "btn-secondary" : "btn-primary")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 4v6h6" /><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10" /></svg>
            Play again
          </button>
        ) : (
          <div className="h-[54px] rounded-2xl text-sm text-[#A3A8C7] border border-white/10 bg-white/[0.04] flex items-center justify-center gap-2.5">
            <span className="nw-typing" aria-hidden="true"><span /><span /><span /></span>
            Waiting for host to start a new game…
          </div>
        )}
      </section>

      {/* ── Achievements unlocked this game ─────────────────────────────── */}
      {newAchievements?.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="section-heading m-0">Unlocked this game</h2>
          <div className="flex flex-wrap gap-2">
            {newAchievements.map((a, i) => (
              <span key={a.id} className="nw-pop inline-flex items-center gap-2 pl-2 pr-3 py-2 rounded-[14px] bg-violet-500/[0.14] border border-violet-400/40" style={{ animationDelay: `${0.8 + i * 0.15}s` }}>
                <span className="w-7 h-7 rounded-[9px] bg-gradient-to-br from-violet-600 to-fuchsia-400 flex items-center justify-center text-sm">{a.icon}</span>
                <span>
                  <span className="block text-[13px] font-extrabold">{a.name}</span>
                  {a.description && <span className="block text-[11px] text-[#A3A8C7]">{a.description}</span>}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Final standings ──────────────────────────────────────────────── */}
      <section>
        <h2 className="section-heading">Final standings</h2>
        {podium.length > 0 && (
          <div className="grid grid-cols-3 gap-2 items-end">
            {PODIUM_ORDER.map((idx) => {
              const p = podium[idx];
              if (!p) return <div key={idx} />;
              const st = PODIUM_STYLE[idx];
              const pts = data?.points?.[p.socketId] ?? 0;
              return (
                <div key={p.socketId} className="nw-rise flex flex-col items-center gap-1.5" style={{ animationDelay: `${0.1 + idx * 0.2}s` }}>
                  <span className={st.avatar}>{p.avatar}</span>
                  <span className={twMerge("text-[13px] truncate max-w-full", st.name)}>
                    {p.socketId === mySocketId ? "You" : p.name}
                  </span>
                  <div className={twMerge("w-full rounded-t-[14px] rounded-b-md border bg-gradient-to-b flex flex-col items-center justify-center", st.h, st.box)}>
                    <span className="text-xl leading-none">{MEDALS[idx]}</span>
                    <span className="nums text-[11px] text-[#C7CBE6] mt-1">{pts} pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {rest.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {rest.map((p, i) => (
              <div key={p.socketId} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-[13px]">
                <span className="nums w-4 text-[#8F95B8]">{i + 4}</span>
                <span>{p.avatar}</span>
                <span className="flex-1 text-[#B4B9D6] truncate">{p.name}</span>
                <span className="nums text-[#8F95B8]">{data?.points?.[p.socketId] ?? 0} pts</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Session stats + target trend ─────────────────────────────────── */}
      <SessionStats history={history} mySocketId={mySocketId} />

      {/* ── Round History ────────────────────────────────────────────────── */}
      {history?.length > 0 && (
        <div className="w-full">
          <button
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="w-full min-h-[46px] flex items-center justify-between px-4 rounded-xl text-sm font-semibold border border-white/10 bg-white/[0.04] text-[#B4B9D6] hover:text-white hover:border-white/20 transition-all"
          >
            <span>Full round-by-round history</span>
            <svg className={twMerge("transition-transform", showHistory && "rotate-180")} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {showHistory && (
            <div className="mt-2 nw-rise">
              <RoundHistory />
            </div>
          )}
        </div>
      )}

      {shareData && (
        <ShareCardModal
          player={shareData}
          variant="victory"
          onClose={() => setShareData(null)}
        />
      )}
    </div>
  );
}

GameOverScreen.propTypes = {
  data: PropTypes.object,
  players: PropTypes.array,
};
