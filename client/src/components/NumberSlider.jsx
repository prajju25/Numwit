import React, { useState } from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";

const SPARK_COLORS = ["#34D399", "#FBBF24", "#A78BFA", "#22D3EE"];

/**
 * NumberSlider — mobile-optimised number picker.
 *
 * Interaction model:
 *   1. User drags the range input, taps ±1, or types into the big number
 *      (clamped to 0-100) to choose a value (pendingValue).
 *   2. User taps "Lock In" to confirm — only then is onSelect() called.
 *   3. After locking, the component enters a locked/disabled visual state.
 *
 * Props mirror NumberGrid so GameBoard needs no logic changes:
 *   onSelect(number)   — called once when user confirms their pick
 *   disabled           — true after submission (locks the entire control)
 *   selectedNumber     — the confirmed pick (used to show locked state)
 *   lastTarget         — optional: previous round's target, marked on the track
 */
export default function NumberSlider({ onSelect, disabled, selectedNumber, lastTarget }) {
  // The value currently shown on the slider — NOT yet submitted
  const [pendingValue, setPendingValue] = useState(50);
  // Bumps on every change so the big number replays its little bounce
  const [bump, setBump] = useState(0);

  const setValue = (n) => {
    setPendingValue(Math.max(0, Math.min(100, Math.round(n))));
    setBump((b) => b + 1);
  };

  const handleSliderChange = (e) => setValue(Number(e.target.value));

  const handleLockIn = () => {
    if (disabled) return;
    onSelect(pendingValue);
  };

  // Keyboard: allow typing a number directly into the big number
  const handleManualInput = (e) => {
    const raw = Number(e.target.value);
    if (!isNaN(raw)) setValue(raw);
  };

  const isLocked = disabled && selectedNumber !== null && selectedNumber !== undefined;
  const shown = isLocked ? selectedNumber : pendingValue;
  const hasLastTarget = typeof lastTarget === "number" && !isLocked;

  return (
    <div className="flex-1 flex flex-col gap-4 select-none">

      {/* Big number with ±1 steppers */}
      <div className="flex items-center justify-between gap-2">
        <StepButton label="Decrease by one" onClick={() => setValue(pendingValue - 1)} disabled={disabled}>
          <path d="M5 12h14" />
        </StepButton>
        <div className="relative flex flex-col items-center min-w-0">
          <span className="label-muted">Your pick</span>
          <input
            type="number"
            min="0"
            max="100"
            inputMode="numeric"
            value={shown}
            onChange={handleManualInput}
            disabled={disabled}
            aria-label="Enter number directly"
            className={twMerge(
              "nums w-[190px] text-center bg-transparent border-0 outline-none p-0",
              "text-[96px] leading-none font-extrabold tracking-[-0.04em]",
              "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
              "focus-visible:ring-2 focus-visible:ring-violet-400/60 rounded-2xl transition-colors duration-300",
              bump % 2 ? "nw-bump-a" : "nw-bump-b",
              isLocked ? "text-emerald-300 cursor-not-allowed" : "text-white"
            )}
            style={{ textShadow: isLocked ? "0 0 40px rgba(52,211,153,.45)" : "0 0 40px rgba(139,92,246,.55)" }}
          />
          {isLocked && <LockBurst />}
        </div>
        <StepButton label="Increase by one" onClick={() => setValue(pendingValue + 1)} disabled={disabled}>
          <path d="M12 5v14M5 12h14" />
        </StepButton>
      </div>

      {/* Slider track */}
      {!isLocked && (
        <div className="relative pt-5">
          {hasLastTarget && (
            <span
              className="nums absolute top-0 w-20 -ml-10 text-center text-[10px] font-bold text-cyan-300"
              style={{ left: `${lastTarget}%` }}
            >
              last {lastTarget.toFixed(1)}
            </span>
          )}
          {/* Custom track fill (purely visual — sits behind the native input) */}
          <div className="absolute left-[13px] right-[13px] top-[37px] h-2.5 rounded-full bg-white/[0.08] pointer-events-none">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-700 via-violet-500 to-violet-400"
              style={{ width: `${pendingValue}%` }}
            />
            {hasLastTarget && (
              <div
                className="absolute -top-2 -bottom-2 w-0.5 bg-cyan-400"
                style={{ left: `${lastTarget}%`, boxShadow: "0 0 8px rgba(34,211,238,.8)" }}
              />
            )}
          </div>

          <input
            type="range"
            min="0"
            max="100"
            step={1}
            value={pendingValue}
            onChange={handleSliderChange}
            disabled={disabled}
            aria-label="Pick a number between 0 and 100"
            className="nw-range relative z-[1] w-full h-11 m-0 cursor-pointer"
          />

          {/* Scale labels */}
          <div className="nums flex justify-between text-[11px] text-[#6E749A] px-1.5">
            <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
          </div>
        </div>
      )}

      {/* Lock In button */}
      {isLocked ? (
        <div className="animate-lock-in h-[60px] rounded-[18px] border-[1.5px] border-emerald-400/55 bg-emerald-500/15 text-emerald-200 font-extrabold text-base flex items-center justify-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
          <span>Locked in: {selectedNumber}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleLockIn}
          disabled={disabled}
          className={twMerge(
            "h-[60px] rounded-[18px] text-lg font-extrabold flex items-center justify-center gap-2.5",
            disabled ? "bg-white/5 text-white/30 border border-white/10 cursor-not-allowed" : "btn-primary"
          )}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Lock In {pendingValue}
        </button>
      )}

      <p className="text-center text-xs text-[#6E749A] m-0">
        Unique picks only (3+ players) · Ties = all win
      </p>
    </div>
  );
}

function StepButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="w-14 h-14 shrink-0 rounded-[18px] border border-white/10 bg-white/5 text-white flex items-center justify-center transition-all duration-100 hover:bg-white/10 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">{children}</svg>
    </button>
  );
}

StepButton.propTypes = {
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  children: PropTypes.node,
};

/** One-shot ring + sparks around the number when the pick locks in. */
function LockBurst() {
  return (
    <div aria-hidden="true" className="absolute left-1/2 top-[60%] w-0 h-0 pointer-events-none">
      <span className="nw-burst-ring absolute -left-[70px] -top-[70px] w-[140px] h-[140px] rounded-full border-[3px] border-emerald-400" />
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className="nw-spark absolute -left-1 -top-1 w-2 h-2 rounded-full"
          style={{ "--a": `${i * 45}deg`, background: SPARK_COLORS[i % SPARK_COLORS.length] }}
        />
      ))}
    </div>
  );
}

NumberSlider.propTypes = {
  onSelect: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  selectedNumber: PropTypes.number,
  lastTarget: PropTypes.number,
};
