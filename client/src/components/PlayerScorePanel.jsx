import React from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";
import { ELIMINATION_THRESHOLD } from "../constants/constants";

export default function PlayerScorePanel({ players, points, eliminatedPlayers }) {
  return (
    <div className="w-36 shrink-0">
      <p className="section-heading">Scores</p>
      <ul className="space-y-1.5">
        {players?.map((p) => {
          const isEliminated = eliminatedPlayers?.includes(p.socketId);
          const pts = points?.[p.socketId] ?? 0;
          const danger = pts >= ELIMINATION_THRESHOLD - 1 && !isEliminated;

          return (
            <li
              key={p.socketId}
              className={twMerge(
                "flex items-center justify-between text-sm gap-1 py-2 px-2.5 rounded-lg border transition-all duration-300",
                isEliminated
                  ? "opacity-35 bg-white/5 border-white/5 line-through"
                  : danger
                  ? "bg-red-500/15 border-red-500/40 animate-pulse"
                  : "bg-white/5 border-white/10"
              )}
            >
              <span className="truncate text-white/80 text-xs">
                {p.avatar} {p.name}
              </span>
              <span
                className={twMerge(
                  "font-extrabold tabular-nums shrink-0 text-xs font-mono",
                  isEliminated ? "text-white/25" : danger ? "text-red-400" : "text-white/70"
                )}
              >
                {pts}
                <span className="text-[9px] font-normal text-white/30">/{ELIMINATION_THRESHOLD}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-white/30 mt-2.5">{ELIMINATION_THRESHOLD} pts = eliminated</p>
    </div>
  );
}

PlayerScorePanel.propTypes = {
  players: PropTypes.array,
  points: PropTypes.object,
  eliminatedPlayers: PropTypes.array,
};
