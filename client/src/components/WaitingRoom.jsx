import React, { useState, useEffect } from "react";
import { useUser } from "../contexts/UserContext";
import { useGame } from "../contexts/GameContext";
import { MIN_PLAYERS } from "../constants/constants";
import socket from "../socket";
import { twMerge } from "tailwind-merge";
import RoomChat from "./RoomChat";
import GameSettingsPanel from "./GameSettingsPanel";
import VoicePanel from "./VoicePanel";

const DEFAULT_SETTINGS = {
  timerDuration: 30,
  eliminationThreshold: 5,
  targetMultiplier: 0.8,
  duplicateRuleEnabled: true,
};

export default function WaitingRoom() {
  const { roomType, roomId, user } = useUser();
  const { players, hostSocketId, botFillAt } = useGame();
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [fillCountdown, setFillCountdown] = useState(null);

  const mySocketId = user?.socketId ?? socket.id;
  const isHost = hostSocketId && mySocketId === hostSocketId;
  const canStart = players && players.length >= MIN_PLAYERS;
  const remaining = MIN_PLAYERS - ((players && players.length) || 0);

  const startGame = () => socket.emit("start_game", { roomId, settings });

  const handleInvite = () => {
    navigator.clipboard.writeText(window.location.origin + "/" + roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Live countdown for public-room auto bot-fill (botFillAt is an epoch ms
  // deadline from the server, or null if no fill is pending).
  useEffect(() => {
    if (!botFillAt) {
      setFillCountdown(null);
      return;
    }
    const tick = () => {
      const secs = Math.max(0, Math.ceil((botFillAt - Date.now()) / 1000));
      setFillCountdown(secs);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [botFillAt]);

  return (
    <div className="w-full max-w-md mx-auto space-y-4 animate-fadeIn">
      {/* Card */}
      <div className="glass-card p-6 space-y-5">

        {/* Header */}
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-extrabold text-white">Waiting for Players…</h2>
          <p className="text-white/50 text-sm">
            {(players?.length || 0)}/{MIN_PLAYERS} minimum · {players?.length || 0} joined
          </p>
        </div>

        {/* Players list */}
        <div>
          <p className="section-heading">Players in Room</p>
          <ul className="space-y-2">
            {players && players.map((player) => {
              const isPlayerHost = player.socketId === hostSocketId;
              return (
                <li
                  key={player.socketId}
                  className={twMerge(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200",
                    isPlayerHost
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-white/10 bg-white/5"
                  )}
                >
                  <span className="text-2xl">{player.avatar}</span>
                  <span className="font-semibold text-white flex-1 text-sm">{player.name}</span>
                  {player.isBot && (
                    <span className="text-xs bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold px-2.5 py-1 rounded-full">
                      🤖 Bot
                    </span>
                  )}
                  {isPlayerHost && (
                    <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold px-2.5 py-1 rounded-full">
                      👑 Host
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Invite link */}
        {roomType === "private" && (
          <button
            onClick={handleInvite}
            className={twMerge(
              "w-full py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all duration-200",
              copied
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                : "bg-white/5 text-white/80 border-white/15 hover:bg-white/10 hover:border-white/25"
            )}
          >
            {copied ? "✅ Link Copied!" : "🔗 Copy Invite Link"}
          </button>
        )}

        {/* Public room: server will auto-fill with bots if no one else joins */}
        {roomType === "public" && !canStart && fillCountdown !== null && (
          <div className="w-full py-2.5 px-4 rounded-xl text-sm text-center text-sky-300 border border-sky-500/20 bg-sky-500/10">
            Looking for players… adding bots in {fillCountdown}s
          </div>
        )}

        {/* Settings — host only */}
        {isHost && (
          <GameSettingsPanel settings={settings} onChange={setSettings} />
        )}

        {/* Start button / status */}
        {isHost ? (
          <button
            disabled={!canStart}
            onClick={startGame}
            className={twMerge(
              "w-full py-3 px-4 rounded-xl text-sm font-bold transition-all duration-200",
              canStart
                ? "btn-success"
                : "bg-white/5 text-white/25 border border-white/10 cursor-not-allowed"
            )}
          >
            {canStart
              ? "▶ Start Game"
              : `Waiting for ${remaining} more player${remaining !== 1 ? "s" : ""}…`}
          </button>
        ) : (
          <div className="w-full py-3 px-4 rounded-xl text-sm text-white/40 border border-white/10 bg-white/5 text-center">
            Waiting for host to start…
          </div>
        )}
      </div>

      {/* Voice Chat */}
      <VoicePanel />

      {/* Room Chat */}
      <RoomChat />
    </div>
  );
}
