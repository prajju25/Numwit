import React, { useState } from "react";
import PropTypes from "prop-types";
import socket from "../socket";
import { useUser } from "../contexts/UserContext";
import { useNumwit } from "../contexts/NumwitRuleContext";
import { twMerge } from "tailwind-merge";
import SessionStats from "./SessionStats";
import RoundHistory from "./RoundHistory";
import LevelBadge from "./LevelBadge";
import ShareCardModal from "./ShareCardModal";
import { useGame } from "../contexts/GameContext";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function GameOverScreen({ data, players }) {
  const { roomId, user, deviceId } = useUser();
  const { history, xpData, myLevel } = useNumwit();
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

  const sorted = [...(players || [])].sort((a, b) => {
    const pa = data?.points?.[a.socketId] ?? 0;
    const pb = data?.points?.[b.socketId] ?? 0;
    return pa - pb;
  });

  return (
    <div className="w-full max-w-sm mx-auto space-y-4 animate-fadeIn">

      {/* Hero card */}
      <div className="glass-card p-8 text-center space-y-5">
        <div>
          <p className="text-6xl mb-3">{iWon ? "🎉" : "💀"}</p>
          <h1 className={`text-3xl font-extrabold tracking-tight ${iWon ? "text-white" : "text-white/70"}`}>
            {iWon ? "You Won!" : "Game Over"}
          </h1>
          {disconnectReason && (
            <p className="text-sm text-white/40 mt-1">A player disconnected — game ended early.</p>
          )}
        </div>

        {/* Share Your Win — only shown to the winner */}
        {iWon && (
          <button
            onClick={handleShare}
            disabled={shareLoading}
            className="w-full py-3 rounded-xl text-sm font-bold border border-violet-500/40 text-violet-300 hover:bg-violet-500/20 transition-all disabled:opacity-50"
            style={{ background: "rgba(124,58,237,0.12)" }}
          >
            {shareLoading ? "Loading your stats…" : "📤 Share Your Win"}
          </button>
        )}

        {/* XP banner */}
        {xpData && (
          <div className={twMerge(
            "rounded-xl py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 border",
            xpData.levelUp
              ? "border-violet-500/40 text-violet-300"
              : "border-white/10 text-white/50"
          )} style={{ background: xpData.levelUp ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.05)" }}>
            {xpData.levelUp && <span className="text-lg">⬆️</span>}
            <span>
              {xpData.xpGained >= 0 ? "+" : ""}{xpData.xpGained} XP
              {xpData.levelUp && ` · Level ${xpData.level} reached!`}
            </span>
            {myLevel && <LevelBadge level={myLevel} />}
          </div>
        )}

        {/* Winner spotlight */}
        {winner && (
          <div className="rounded-xl py-4 px-6 border border-amber-500/35"
            style={{ background: "rgba(245,158,11,0.1)" }}>
            <p className="label-muted text-amber-400/70 mb-1">🏆 Winner</p>
            <p className="text-2xl font-extrabold text-amber-300">
              {winner.avatar} {winner.name}
            </p>
          </div>
        )}

        {/* Final leaderboard */}
        <div className="text-left rounded-xl overflow-hidden border border-white/10">
          <div className="px-4 py-2 label-muted border-b border-white/10"
            style={{ background: "rgba(255,255,255,0.05)" }}>
            Final Scores
          </div>
          {sorted.map((p, i) => {
            const pts = data?.points?.[p.socketId] ?? 0;
            const isWinner = p.socketId === data?.winnerSocketId;
            return (
              <div key={p.socketId}
                className={`flex items-center justify-between px-4 py-3 border-t border-white/5 text-sm ${isWinner ? "bg-amber-500/10" : ""}`}>
                <span className="flex items-center gap-2">
                  <span className="text-base w-5">{MEDALS[i] || `${i + 1}.`}</span>
                  <span className="text-xl">{p.avatar}</span>
                  <span className={isWinner ? "font-extrabold text-amber-300" : "text-white/70"}>
                    {p.name}
                  </span>
                </span>
                <span className="font-mono font-bold text-white/60">{pts} pts</span>
              </div>
            );
          })}
        </div>

        {/* Session stats */}
        <SessionStats history={history} mySocketId={mySocketId} />

        {/* Round History */}
        {history?.length > 0 && (
          <div className="w-full">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-white/60 hover:text-white/90 hover:border-white/20 transition-all"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <span>📋 Round History</span>
              <span className="text-white/30 text-xs">{showHistory ? "▲ hide" : "▼ show"}</span>
            </button>
            {showHistory && (
              <div className="mt-2">
                <RoundHistory />
              </div>
            )}
          </div>
        )}

        {/* Play again — only host can trigger; others wait */}
        {isHost ? (
          <button
            onClick={handleRestart}
            className="btn-primary w-full py-3.5"
          >
            🔄 Play Again
          </button>
        ) : (
          <div className="w-full py-3 rounded-xl text-sm text-center text-white/40 border border-white/10"
            style={{ background: "rgba(255,255,255,0.04)" }}>
            <span className="animate-pulse mr-2">⏳</span>
            Waiting for host to start a new game…
          </div>
        )}
      </div>

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
