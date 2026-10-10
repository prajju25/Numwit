import React from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";

/**
 * LevelBadge
 * ─────────────────────────────────────────────────────────────────────────────
 * Small chip showing a player's level number.
 * Color scales with level tier:
 *   Lv  1-2: gray    Lv  3-4: green
 *   Lv  5-6: blue    Lv  7-8: purple
 *   Lv  9+:  gold
 */
export default function LevelBadge({ level, className }) {
  if (!level || level < 1) return null;

  const tier =
    level >= 9 ? "gold" :
    level >= 7 ? "purple" :
    level >= 5 ? "blue" :
    level >= 3 ? "green" : "gray";

  const colors = {
    gray:   "bg-white/10 text-white/70",
    green:  "bg-emerald-500/20 text-emerald-200",
    blue:   "bg-sky-500/20 text-sky-200",
    purple: "bg-violet-500/25 text-violet-200",
    gold:   "bg-amber-400/20 text-amber-200 font-bold",
  };

  return (
    <span
      className={twMerge(
        "nums inline-flex items-center justify-center text-xs font-bold rounded-md px-1.5 py-0.5 shrink-0",
        colors[tier],
        className
      )}
      title={`Level ${level}`}
    >
      {tier === "gold" ? "★" : "Lv"}{level}
    </span>
  );
}

LevelBadge.propTypes = {
  level: PropTypes.number,
  className: PropTypes.string,
};
