import React from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";
import { ELIMINATION_THRESHOLD } from "../constants/constants";

/**
 * PlayerScorePanel — standings with penalty pips (gold, coral at one-from-out).
 * lockedIds (optional) marks who has already locked in this round.
 */
export default function PlayerScorePanel({ players, points, eliminatedPlayers, lockedIds, mySocketId }) {
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-2.5">
        <p className="section-heading m-0">Standings</p>
        <p className="text-[10px] text-[#8F95B8] m-0">{ELIMINATION_THRESHOLD} pts = eliminated</p>
      </div>
      <ul className="flex flex-col gap-1.5 list-none m-0 p-0">
        {players?.map((p) => {
          const isEliminated = eliminatedPlayers?.includes(p.socketId);
          const pts = points?.[p.socketId] ?? 0;
          const danger = pts >= ELIMINATION_THRESHOLD - 1 && !isEliminated;
          const isMe = mySocketId && p.socketId === mySocketId;
          const locked = lockedIds?.includes(p.socketId);

          return (
            <li
              key={p.socketId}
              data-danger={danger || undefined}
              className={twMerge(
                "flex items-center gap-2.5 py-2 px-2.5 rounded-xl border transition-all duration-300",
                isEliminated
                  ? "opacity-35 bg-white/[0.03] border-white/5 line-through"
                  : danger
                  ? "bg-red-500/[0.08] border-red-400/35"
                  : isMe
                  ? "bg-violet-500/[0.14] border-violet-400/45"
                  : "bg-white/[0.03] border-white/[0.06]"
              )}
            >
              <span className="text-base leading-none shrink-0">{p.avatar}</span>
              <span className="flex-1 min-w-0">
                <span className={twMerge(
                  "block truncate text-[13px] font-semibold",
                  isMe ? "text-violet-200" : danger ? "text-red-300" : "text-white/85"
                )}>
                  {p.name}{p.isBot ? " 🤖" : ""}
                </span>
                <span className="flex gap-[3px] mt-1" aria-hidden="true">
                  {Array.from({ length: ELIMINATION_THRESHOLD }, (_, i) => (
                    <span
                      key={i}
                      className={twMerge(
                        "h-[5px] flex-1 max-w-[16px] rounded-full transition-colors duration-300",
                        i < pts ? (danger || isEliminated ? "bg-red-400" : "bg-amber-400") : "bg-white/10"
                      )}
                    />
                  ))}
                </span>
              </span>
              {locked && !isEliminated && (
                <span className="nw-pop text-[11px] font-extrabold text-emerald-300 shrink-0">locked</span>
              )}
              <span
                className={twMerge(
                  "nums font-extrabold text-xs shrink-0",
                  isEliminated ? "text-white/25" : danger ? "text-red-300" : "text-white/70"
                )}
                aria-label={`${pts} of ${ELIMINATION_THRESHOLD} penalty points`}
              >
                <span>{pts}</span>
                <span className="text-[9px] font-normal text-white/30">/{ELIMINATION_THRESHOLD}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

PlayerScorePanel.propTypes = {
  players: PropTypes.array,
  points: PropTypes.object,
  eliminatedPlayers: PropTypes.array,
  lockedIds: PropTypes.array,
  mySocketId: PropTypes.string,
};
