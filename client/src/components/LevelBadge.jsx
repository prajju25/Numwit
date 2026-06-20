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
    gray:   "bg-gray-100 text-gray-500",
    green:  "bg-green-100 text-green-700",
    blue:   "bg-blue-100 text-blue-700",
    purple: "bg-purple-100 text-purple-700",
    gold:   "bg-amber-100 text-amber-700 font-bold",
  };

  return (
    <span
      className={twMerge(
        "inline-flex items-center justify-center text-xs rounded-full px-1.5 py-0.5 tabular-nums shrink-0",
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
