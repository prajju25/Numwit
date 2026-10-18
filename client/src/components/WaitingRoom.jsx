import React, { useState, useEffect } from "react";
import { useUser } from "../contexts/UserContext";
import { useGame } from "../contexts/GameContext";
import { MIN_PLAYERS } from "../constants/constants";
import socket from "../socket";
import { twMerge } from "tailwind-merge";
import RoomChat from "./RoomChat";
import GameSettingsPanel from "./GameSettingsPanel";
import VoicePanel from "./VoicePanel";
import { track } from "../services/analytics";
import { readChallenge, clearChallenge } from "../hooks/useChallengeFriends";

const DEFAULT_SETTINGS = {
  timerDuration: 30,
  eliminationThreshold: 5,
  targetMultiplier: 0.8,
  duplicateRuleEnabled: true,
};

const MAX_SEATS = 8;

export default function WaitingRoom() {
  const { roomType, roomId, user } = useUser();
  const { players, hostSocketId, botFillAt } = useGame();
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [fillCountdown, setFillCountdown] = useState(null);

  const mySocketId = user?.socketId ?? socket.id;
  const isHost = hostSocketId && mySocketId === hostSocketId;
  const count = players?.length || 0;
  const canStart = count >= MIN_PLAYERS;
  const remaining = MIN_PLAYERS - count;
  const emptySeats = Math.max(0, MAX_SEATS - count);
  const inviteUrl = `${window.location.origin}/${roomId}`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const startGame = () => socket.emit("start_game", { roomId, settings });

  // "Challenge friends" from a game-over screen: the message waits here, to be
  // sent with this room's link from a tap (phones only share after a tap).
  const [challenge, setChallenge] = useState(readChallenge);
  const [challengeStatus, setChallengeStatus] = useState(""); // "", "sent", "copied", "failed"
  useEffect(() => () => clearChallenge(), []); // done once the game starts or they leave
  const dismissChallenge = () => { clearChallenge(); setChallenge(null); };
  const sendChallenge = async () => {
    const sheet = canNativeShare && typeof window.matchMedia === "function"
      && window.matchMedia("(pointer: coarse)").matches;
    try {
      if (sheet) {
        await navigator.share({ title: "Numwit", text: challenge, url: inviteUrl });
        track("invite", { method: "challenge_sheet" });
        setChallengeStatus("sent");
      } else {
        await navigator.clipboard.writeText(challenge + "\n" + inviteUrl);
        track("invite", { method: "challenge_copy" });
        setChallengeStatus("copied");
      }
    } catch (err) {
      if (err?.name !== "AbortError") setChallengeStatus("failed");
    }
  };

  const handleInvite = () => {
    track("invite", { method: "copy_link" });
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleNativeShare = () => {
    track("invite", { method: "native_share" });
    navigator.share({ title: "Numwit", text: "Join my Numwit room — can you outguess us?", url: inviteUrl })
      .catch(() => {}); // AbortError = user closed the sheet
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
    <div className="w-full max-w-md mx-auto flex flex-col gap-3.5 animate-fadeIn">

      {/* ── Room hero ─────────────────────────────────────────────────────── */}
      <section className="glass-card rounded-[22px] p-4 sm:p-5 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <span className={twMerge(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.08em] border",
            roomType === "private"
              ? "bg-violet-500/15 border-violet-500/35 text-violet-300"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
          )}>
            {roomType === "private" ? "Private room" : "Public room"}
          </span>
          <span className="text-xs text-[#8F95B8]">
            {count}/{MIN_PLAYERS} minimum · {count} joined
          </span>
        </div>

        {roomType === "private" && challenge && (
          <div className="nw-pop rounded-2xl border border-violet-400/45 bg-violet-500/[0.12] p-4 flex flex-col gap-3" aria-label="Your challenge">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">⚔️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-white m-0">Your challenge is ready</p>
                <p className="text-[13px] text-[#C7CBE6] mt-1 mb-0">“{challenge}”</p>
              </div>
              <button onClick={dismissChallenge} aria-label="Dismiss challenge"
                className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 text-lg leading-none shrink-0">×</button>
            </div>
            <button onClick={sendChallenge} className="h-12 rounded-xl text-[15px] font-extrabold btn-primary flex items-center justify-center gap-2">
              {challengeStatus === "copied" ? "✓ Copied — paste it to your friends"
                : challengeStatus === "sent" ? "✓ Sent — send to more friends"
                : challengeStatus === "failed" ? "Couldn't share — try again"
                : "Send challenge"}
            </button>
          </div>
        )}

        {roomType === "private" && (
          <>
            <div>
              <div className="text-xs text-[#8F95B8] mb-1">Room code</div>
              <div className="nums text-[30px] sm:text-[34px] font-bold tracking-[0.18em] text-white break-all">{roomId}</div>
            </div>
            <div className={twMerge("grid gap-2", canNativeShare ? "grid-cols-2" : "grid-cols-1")}>
              <button
                onClick={handleInvite}
                className={twMerge(
                  "h-[46px] rounded-xl text-sm font-bold border flex items-center justify-center gap-2 transition-all duration-200 active:scale-95",
                  copied
                    ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/45"
                    : "bg-white/5 text-white border-white/15 hover:bg-white/10"
                )}
              >
                {copied ? "Link copied" : "Copy invite link"}
              </button>
              {canNativeShare && (
                <button
                  onClick={handleNativeShare}
                  className="h-[46px] rounded-xl text-sm font-bold border bg-white/5 text-white border-white/15 hover:bg-white/10 flex items-center justify-center gap-2 transition active:scale-95"
                >
                  <ShareIcon />
                  Share invite
                </button>
              )}
            </div>
          </>
        )}

        {/* Public room: the server starts the game when the countdown ends —
            topped up with bots if too few people came */}
        {roomType === "public" && fillCountdown !== null && (
          <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm text-cyan-200 border border-cyan-400/25 bg-cyan-400/10">
            <span className="nw-typing shrink-0" aria-hidden="true"><span /><span /><span /></span>
            {canStart
              ? <>Game starts in <span className="nums font-bold">{fillCountdown}s</span></>
              : <>Looking for players… adding bots in <span className="nums font-bold">{fillCountdown}s</span></>}
          </div>
        )}
      </section>

      {/* ── Seats ─────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-bold m-0">Players</h2>
          <span className={twMerge("text-xs font-semibold", canStart ? "text-emerald-300" : "text-[#8F95B8]")}>
            {canStart ? `Ready — ${count} in` : `Need ${remaining} more to start`}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden" aria-hidden="true">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-500"
            style={{ width: `${Math.min(100, (count / MAX_SEATS) * 100)}%` }}
          />
        </div>
        <ul className="grid grid-cols-4 gap-2 list-none m-0 p-0">
          {players?.map((player, i) => {
            const isPlayerHost = player.socketId === hostSocketId;
            const isMe = player.socketId === mySocketId;
            return (
              <li
                key={player.socketId}
                className={twMerge(
                  "nw-seat-in relative flex flex-col items-center gap-1.5 pt-3 pb-2.5 px-1 rounded-2xl border",
                  isPlayerHost ? "bg-amber-400/[0.08] border-amber-400/35" : "bg-white/[0.04] border-white/10"
                )}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                {isPlayerHost && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1.5 h-5 rounded-full bg-amber-400 text-[#1A1206] text-[10px] font-extrabold">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7z" /></svg>
                    Host
                  </span>
                )}
                <span className={twMerge(
                  "w-11 h-11 rounded-full bg-[#1A1E38] border-2 flex items-center justify-center text-[22px]",
                  isMe ? "border-violet-400" : "border-white/15"
                )}>
                  {player.avatar}
                </span>
                <span className="text-xs font-semibold max-w-full truncate px-1">{player.name}</span>
                {player.isBot && (
                  <span className="text-[10px] font-bold text-sky-300 bg-sky-500/15 border border-sky-500/30 rounded-full px-1.5">Bot</span>
                )}
              </li>
            );
          })}
          {Array.from({ length: emptySeats }, (_, i) => (
            <li
              key={`empty-${i}`}
              className="nw-breathe flex items-center justify-center min-h-[92px] rounded-2xl border-[1.5px] border-dashed border-white/15 text-[11px] text-[#6E749A]"
              style={{ animationDelay: `${i * 0.3}s` }}
            >
              Open
            </li>
          ))}
        </ul>
      </section>

      {/* ── Voice ─────────────────────────────────────────────────────────── */}
      <VoicePanel />

      {/* ── Settings — host only ──────────────────────────────────────────── */}
      {isHost && (
        <GameSettingsPanel settings={settings} onChange={setSettings} />
      )}

      {/* ── Chat ──────────────────────────────────────────────────────────── */}
      <RoomChat />

      {/* ── Start / status (sticky on phones) ─────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-4 sm:static sm:m-0 sm:p-0"
        style={{ background: "linear-gradient(180deg, rgba(11,14,28,0), rgba(11,14,28,.92) 35%)" }}>
        {isHost ? (
          <button
            disabled={!canStart}
            onClick={startGame}
            className={twMerge(
              "w-full h-[56px] rounded-2xl text-base font-extrabold transition-all duration-200",
              canStart
                ? "btn-success"
                : "bg-white/5 text-white/30 border border-white/10 cursor-not-allowed"
            )}
          >
            {canStart
              ? `▶ Start game · ${count} players`
              : `Waiting for ${remaining} more player${remaining !== 1 ? "s" : ""}…`}
          </button>
        ) : (
          <div className="w-full h-[56px] rounded-2xl text-sm text-[#A3A8C7] border border-white/10 bg-white/[0.04] flex items-center justify-center gap-2.5">
            <span className="nw-typing" aria-hidden="true"><span /><span /><span /></span>
            Waiting for host to start…
          </div>
        )}
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}
