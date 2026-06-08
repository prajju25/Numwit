/**
 * VoicePanel.jsx — Voice chat UI
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows: join/leave button, mic mute toggle, speaking indicators per peer.
 * Reads from VoiceContext — no WebRTC logic here.
 *
 * Props:
 *   players  — array of { socketId, name, avatar } from GameContext / WaitingRoom
 */

import React from "react";
import PropTypes from "prop-types";
import { useVoice } from "../contexts/VoiceContext";
import { useGame } from "../contexts/GameContext";
import { useUser } from "../contexts/UserContext";

// ── Icons (inline SVG — no icon library dependency) ──────────────────────────
const iconPropTypes = { className: PropTypes.string };

const MicIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);
MicIcon.propTypes = iconPropTypes;

const MicOffIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);
MicOffIcon.propTypes = iconPropTypes;

const PhoneIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.07 3.37a2 2 0 0 1 2-2.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);
PhoneIcon.propTypes = iconPropTypes;

const PhoneOffIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
    <line x1="23" y1="1" x2="1" y2="23" />
  </svg>
);
PhoneOffIcon.propTypes = iconPropTypes;

// ── Speaking ring animation ───────────────────────────────────────────────────
// A pulsing green ring around the avatar when someone is speaking.
const SpeakingRing = () => (
  <span
    className="absolute inset-0 rounded-full animate-ping"
    style={{ background: "rgba(34,197,94,0.35)", animationDuration: "0.9s" }}
  />
);

// ── PeerTile — one player's voice status ─────────────────────────────────────
function PeerTile({ player, speaking, muted, connected }) {
  return (
    <div
      className={[
        "flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200",
        speaking ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-white/5 border border-transparent",
      ].join(" ")}
      title={player ? `${player.name}${muted ? " (muted)" : ""}` : "Connecting…"}
    >
      {/* Avatar with speaking ring */}
      <span className="relative inline-flex">
        {speaking && <SpeakingRing />}
        <span className="relative text-xl leading-none">{player?.avatar || "👤"}</span>
      </span>

      {/* Name (truncated) */}
      <span className="text-[10px] text-white/60 max-w-[52px] truncate leading-tight text-center">
        {player?.name || "…"}
      </span>

      {/* Status indicator */}
      <span className="text-[9px] leading-none">
        {!connected ? (
          <span className="text-white/30">connecting</span>
        ) : muted ? (
          <span className="text-red-400">🔇</span>
        ) : speaking ? (
          <span className="text-emerald-400">speaking</span>
        ) : (
          <span className="text-white/25">listening</span>
        )}
      </span>
    </div>
  );
}

PeerTile.propTypes = {
  player:    PropTypes.object,
  speaking:  PropTypes.bool,
  muted:     PropTypes.bool,
  connected: PropTypes.bool,
};

// ── Error message lookup ──────────────────────────────────────────────────────
const ERROR_MESSAGES = {
  permission_denied: "Microphone access denied. Allow mic in browser settings.",
  not_supported:     "Your browser doesn't support voice chat.",
  unavailable:       "Microphone unavailable. Check your device.",
};

// ── VoicePanel ─────────────────────────────────────────────────────────────────
export default function VoicePanel() {
  const { joined, isMuted, localSpeaking, error, peers, joinVoice, leaveVoice, toggleMute } = useVoice();
  const { players } = useGame();
  const { user }    = useUser();

  // Merge peer state (socketId → {speaking, muted, connected}) with player info
  const peerEntries = Object.entries(peers);

  // ── Not joined ───────────────────────────────────────────────────────────────
  if (!joined) {
    return (
      <div className="glass-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          {/* Voice icon */}
          <span className="text-base">🎙️</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white/80">Voice Chat</p>
            <p className="text-[10px] text-white/40 leading-tight">Talk with other players</p>
          </div>
          <button
            onClick={joinVoice}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150
              bg-emerald-600/30 border border-emerald-500/40 text-emerald-400
              hover:bg-emerald-600/50 hover:border-emerald-400/60 active:scale-95"
          >
            <PhoneIcon className="w-3 h-3" />
            Join
          </button>
        </div>

        {/* Error feedback */}
        {error && (
          <p className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5 leading-snug">
            ⚠️ {ERROR_MESSAGES[error] || "Could not start voice chat."}
          </p>
        )}
      </div>
    );
  }

  // ── Joined ────────────────────────────────────────────────────────────────────
  return (
    <div className="glass-card p-3 space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2">
        {/* Live badge */}
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <p className="text-xs font-semibold text-white/80 flex-1">Voice Chat</p>

        {/* Mute toggle */}
        <button
          onClick={toggleMute}
          title={isMuted ? "Unmute" : "Mute"}
          className={[
            "p-1.5 rounded-lg transition-all duration-150 active:scale-95 border",
            isMuted
              ? "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
              : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90",
          ].join(" ")}
        >
          {isMuted ? <MicOffIcon className="w-3.5 h-3.5" /> : <MicIcon className="w-3.5 h-3.5" />}
        </button>

        {/* Leave */}
        <button
          onClick={leaveVoice}
          title="Leave voice"
          className="p-1.5 rounded-lg transition-all duration-150 active:scale-95
            bg-red-500/15 border border-red-500/30 text-red-400
            hover:bg-red-500/25 hover:border-red-500/50"
        >
          <PhoneOffIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Peer grid — local user first, then remote peers */}
      <div className="flex flex-wrap gap-2">
        {/* Local user tile */}
        <PeerTile
          player={user ? { name: user.name, avatar: user.avatar } : null}
          speaking={localSpeaking}
          muted={isMuted}
          connected={true}
        />

        {/* Remote peers */}
        {peerEntries.map(([socketId, peerState]) => {
          const player = players?.find(p => p.socketId === socketId);
          return (
            <PeerTile
              key={socketId}
              player={player}
              speaking={peerState.speaking}
              muted={peerState.muted}
              connected={peerState.connected}
            />
          );
        })}

        {/* Empty state — no other peers in voice yet */}
        {peerEntries.length === 0 && (
          <p className="text-[10px] text-white/30 italic self-center pl-1">
            Waiting for others to join voice…
          </p>
        )}
      </div>

      {/* Muted banner */}
      {isMuted && (
        <p className="text-[10px] text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg py-1 leading-none">
          🔇 You are muted — others can&apos;t hear you
        </p>
      )}
    </div>
  );
}
