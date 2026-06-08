import React from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";
import { ELIMINATION_THRESHOLD } from "../constants/constants";

/**
 * DuelView
 * ─────────────────────────────────────────────────────────────────────────────
 * Special 1v1 layout shown when exactly 2 active players remain.
 * Replaces the PlayerScorePanel + NumberInput column layout.
 *
 * Shows:
 *   Left card  — opponent
 *   Center     — VS badge + 2-player cycle reminder
 *   Right card — you
 *
 * Props:
 *   players         {Array}
 *   points          {Object}
 *   eliminatedPlayers {Array}
 *   mySocketId      {string}
 *   children        — the NumberInput (rendered in the center)
 */
export default function DuelView({ players, points, eliminatedPlayers, mySocketId, children }) {
  const active = (players || []).filter((p) => !(eliminatedPlayers || []).includes(p.socketId));

  // Eliminated player is an observer — show both duelists side-by-side neutrally.
  const isObserver = !active.find((p) => p.socketId === mySocketId);
  const me       = active.find((p) => p.socketId === mySocketId);
  const opponent = active.find((p) => p.socketId !== mySocketId);

  // Left / Right assignment:
  //   Observer  → active[0] vs active[1] (no "YOU" label)
  //   Participant → opponent left, me right
  const leftPlayer  = isObserver ? active[0] : opponent;
  const rightPlayer = isObserver ? active[1] : me;

  const renderCard = (player, isMe) => {
    if (!player) {
      return (
        <div className="flex-1 flex items-center justify-center rounded-2xl border-2 border-dashed border-white/10 p-4 text-white/20 text-sm">
          ?
        </div>
      );
    }
    const pts = points?.[player.socketId] ?? 0;
    const danger = pts >= ELIMINATION_THRESHOLD - 1;

    return (
      <div
        className={twMerge(
          "flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
          isMe
            ? "border-indigo-300 bg-indigo-50 animate-duel-glow"
            : "border-gray-200 bg-gray-50",
          danger ? "border-red-300 bg-red-50" : ""
        )}
      >
        <span className="text-4xl">{player.avatar}</span>
        <span className="font-bold text-sm text-gray-800">{player.name}</span>
        {isMe && <span className="text-xs text-indigo-500 font-semibold">YOU</span>}
        <div className={twMerge(
          "text-2xl font-bold tabular-nums",
          danger ? "text-red-500 animate-pulse" : "text-gray-700"
        )}>
          {pts}
          <span className="text-sm font-normal text-gray-400">/{ELIMINATION_THRESHOLD}</span>
        </div>
        {danger && (
          <span className="text-xs text-red-500 font-semibold animate-pulse">⚠️ Danger zone!</span>
        )}
      </div>
    );
  };

  return (
    <div className="w-full space-y-4">
      {/* Duel header */}
      <div className="text-center">
        <span className="inline-block bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
          ⚔️ 1v1 Duel
        </span>
      </div>

      {/* Two-player cycle reminder */}
      <div className="text-xs text-center text-gray-500 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
        Special rules: <strong>100 beats 0</strong> · <strong>0 beats 1</strong> · <strong>1 beats 100</strong>
      </div>

      {/* Player cards */}
      <div className="flex items-center gap-3">
        {renderCard(leftPlayer, false)}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="text-2xl font-black text-gray-300">VS</span>
        </div>
        {renderCard(rightPlayer, !isObserver)}
      </div>

      {/* Number input or eliminated message (passed as children) */}
      <div className="mt-2">
        {children}
      </div>
    </div>
  );
}

DuelView.propTypes = {
  players: PropTypes.array,
  points: PropTypes.object,
  eliminatedPlayers: PropTypes.array,
  mySocketId: PropTypes.string,
  children: PropTypes.node,
};
