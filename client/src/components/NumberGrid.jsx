import React from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";

const ZONE_RADIUS = 3; // cells either side of last round's target that get tinted

/**
 * NumberGrid — desktop picker. One click submits; the picked cell pops and
 * glows while the rest of the grid ripples back from it.
 */
export default function NumberGrid({ onSelect, disabled, selectedNumber, lastTarget }) {
  const hasPick = selectedNumber !== null && selectedNumber !== undefined;
  const zoneCenter = typeof lastTarget === "number" ? Math.round(lastTarget) : null;

  const cellProps = (n) => {
    const isSel = selectedNumber === n;
    const inZone = zoneCenter !== null && Math.abs(n - zoneCenter) <= ZONE_RADIUS;
    return {
      "aria-pressed": isSel,
      className: twMerge(
        "nums relative h-9 xl:h-10 rounded-[9px] text-[13px] font-bold border transition-all duration-100",
        isSel
          ? "nw-picked scale-110 z-[2] bg-emerald-500 border-emerald-200 text-white"
          : disabled
          ? "cursor-default"
          : "hover:-translate-y-0.5 hover:scale-110 hover:z-[2] hover:bg-violet-500/60 hover:border-violet-300 hover:text-white hover:shadow-[0_8px_18px_-6px_rgba(124,58,237,0.8)] active:scale-90",
        !isSel && (inZone
          ? "bg-cyan-400/[0.12] border-cyan-400/45 text-cyan-100"
          : "bg-white/[0.04] border-white/[0.08] text-[#A3A8C7]"),
        !isSel && disabled && hasPick && "nw-wave"
      ),
      style: !isSel && disabled && hasPick ? { animationDelay: `${Math.abs(n - selectedNumber) * 6}ms` } : undefined,
    };
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <button
          disabled={disabled}
          onClick={() => onSelect(0)}
          {...cellProps(0)}
          className={twMerge(cellProps(0).className, "w-16")}
        >
          0
        </button>
        {zoneCenter !== null && (
          <span className="text-xs text-[#8F95B8] flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-cyan-400/25 border border-cyan-400/60" aria-hidden="true" />
            last round&apos;s target zone ({lastTarget.toFixed(1)})
          </span>
        )}
      </div>

      {/* 1–100 grid */}
      <div className="grid grid-cols-10 gap-[5px]">
        {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            disabled={disabled}
            onClick={() => onSelect(n)}
            {...cellProps(n)}
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
  lastTarget: PropTypes.number,
};
