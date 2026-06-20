import React, { useState } from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";

/**
 * NumberSlider — mobile-optimised number picker.
 *
 * Interaction model:
 *   1. User drags the range input to choose a value (pendingValue), or
 *      types a value directly into the numeric input (clamped to 0-100).
 *   2. User taps "Lock In" to confirm — only then is onSelect() called.
 *   3. After locking, the component enters a locked/disabled visual state.
 *
 * Props mirror NumberGrid exactly so GameBoard needs no logic changes:
 *   onSelect(number)   — called once when user confirms their pick
 *   disabled           — true after submission (locks the entire control)
 *   selectedNumber     — the confirmed pick (used to show locked state)
 */
export default function NumberSlider({ onSelect, disabled, selectedNumber }) {
  // The value currently shown on the slider — NOT yet submitted
  const [pendingValue, setPendingValue] = useState(50);

  const handleSliderChange = (e) => {
    setPendingValue(Number(e.target.value));
  };

  const handleLockIn = () => {
    if (disabled) return;
    onSelect(pendingValue);
  };

  // Keyboard: allow typing a number directly into a small input
  const handleManualInput = (e) => {
    const raw = Number(e.target.value);
    if (!isNaN(raw)) {
      const clamped = Math.max(0, Math.min(100, Math.round(raw)));
      setPendingValue(clamped);
    }
  };

  // Track position percentage for the custom track fill
  const pct = (pendingValue / 100) * 100;

  const isLocked = disabled && selectedNumber !== null && selectedNumber !== undefined;

  return (
    <div className="flex-1 flex flex-col gap-4 select-none">

      {/* Value display */}
      <div className="flex items-center justify-center gap-3">
        <span className="text-xs text-gray-400 uppercase tracking-wide">Your pick</span>
        <input
          type="number"
          min="0"
          max="100"
          value={isLocked ? selectedNumber : pendingValue}
          onChange={handleManualInput}
          disabled={disabled}
          aria-label="Enter number directly"
          className={twMerge(
            "w-20 text-center text-3xl font-bold rounded-xl border-2 py-1 tabular-nums",
            "focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all",
            isLocked
              ? "border-green-400 text-green-700 bg-green-50 cursor-not-allowed"
              : "border-indigo-300 text-indigo-800 bg-white"
          )}
        />
      </div>

      {/* Slider track */}
      {!isLocked && (
        <div className="relative px-1">
          {/* Custom track fill (purely visual — sits behind the native input) */}
          <div className="absolute inset-y-0 left-1 right-1 flex items-center pointer-events-none">
            <div className="relative w-full h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="absolute h-full bg-indigo-500 rounded-full transition-all duration-75"
                style={{ width: `${pct}%` }}
              />
            </div>
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
            className={twMerge(
              "relative w-full h-8 appearance-none bg-transparent cursor-pointer",
              "focus:outline-none",
              // Thumb styles via global CSS — see index.css additions
              "[&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:w-7",
              "[&::-webkit-slider-thumb]:h-7",
              "[&::-webkit-slider-thumb]:rounded-full",
              "[&::-webkit-slider-thumb]:bg-indigo-600",
              "[&::-webkit-slider-thumb]:shadow-lg",
              "[&::-webkit-slider-thumb]:border-2",
              "[&::-webkit-slider-thumb]:border-white",
              "[&::-moz-range-thumb]:w-7",
              "[&::-moz-range-thumb]:h-7",
              "[&::-moz-range-thumb]:rounded-full",
              "[&::-moz-range-thumb]:bg-indigo-600",
              "[&::-moz-range-thumb]:border-2",
              "[&::-moz-range-thumb]:border-white",
              "[&::-moz-range-thumb]:shadow-lg"
            )}
          />

          {/* Min/Max labels */}
          <div className="flex justify-between text-xs text-gray-400 mt-1 px-0.5">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>
      )}

      {/* Lock In button */}
      {isLocked ? (
        <div className="flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-green-100 border-2 border-green-400 text-green-700 font-bold text-base">
          <span>✅</span>
          <span>Locked in: {selectedNumber}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleLockIn}
          disabled={disabled}
          className={twMerge(
            "w-full py-3 px-6 rounded-xl font-bold text-base transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2",
            disabled
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-md hover:shadow-lg"
          )}
        >
          Lock In {pendingValue}
        </button>
      )}

      <p className="text-center text-xs text-gray-400">
        Unique picks only (3+ players) · Ties = all win
      </p>
    </div>
  );
}

NumberSlider.propTypes = {
  onSelect: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  selectedNumber: PropTypes.number,
};
