import React from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";

export default function NumberGrid({ onSelect, disabled, selectedNumber }) {
  const btnClass = (n) =>
    twMerge(
      "px-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-100 border",
      selectedNumber === n
        ? "bg-emerald-500 border-emerald-400 text-white scale-110 shadow-lg shadow-emerald-500/40"
        : disabled
        ? "bg-white/3 border-white/5 text-white/20 cursor-not-allowed"
        : "bg-white/8 border-white/10 text-white/70 hover:bg-violet-600/70 hover:border-violet-500 hover:text-white hover:scale-105 active:scale-95"
    );

  return (
    <div className="flex-1 min-w-0">
      {/* Zero button */}
      <button
        disabled={disabled}
        onClick={() => onSelect(0)}
        className={twMerge(btnClass(0), "mb-2 px-4 py-1.5 text-sm")}
      >
        0
      </button>

      {/* 1–100 grid */}
      <div className="grid grid-cols-10 gap-0.5">
        {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            disabled={disabled}
            onClick={() => onSelect(n)}
            className={btnClass(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

NumberGrid.propTypes = {
  onSelect: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  selectedNumber: PropTypes.number,
};
