import React, { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";
import useCountdown from "../hooks/useCountdown";
import soundManager from "../services/soundManager";

/**
 * CountdownTimer — circular SVG ring with time indicator.
 * Violet → amber at ≤10s → red + pulsing at ≤5s.
 */
export default function CountdownTimer({ timerDuration }) {
  const { timeLeft, isExpired } = useCountdown(timerDuration);
  const lastTickRef = useRef(null);

  useEffect(() => {
    if (timeLeft <= 0 || timeLeft > 10) return;
    if (lastTickRef.current === timeLeft) return;
    lastTickRef.current = timeLeft;
    soundManager.playTimerTick();
  }, [timeLeft]);

  if (!timerDuration) return null;

  const pct   = timerDuration > 0 ? (timeLeft / timerDuration) * 100 : 0;
  const isWarning = timeLeft <= 10 && !isExpired;
  const isDanger  = timeLeft <= 5  && !isExpired;

  // SVG ring
  const size   = 64;
  const stroke = 4;
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const dash   = circ * (pct / 100);

  const ringColor = isExpired ? "#4B5563"
    : isDanger    ? "#EF4444"
    : isWarning   ? "#F59E0B"
    :               "#8B5CF6";

  const textColor = isExpired ? "text-white/30"
    : isDanger    ? "text-red-400"
    : isWarning   ? "text-amber-400"
    :               "text-violet-400";

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-4">
        {/* Ring */}
        <div className={twMerge(
          "shrink-0 relative",
          isDanger ? "animate-danger-pulse" : isWarning ? "animate-glow-pulse" : ""
        )}>
          <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
            {/* Track */}
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={stroke}
            />
            {/* Progress */}
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none"
              stroke={ringColor}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              style={{ transition: "stroke-dasharray 0.3s ease, stroke 0.3s ease" }}
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={twMerge("text-sm font-extrabold font-mono", textColor)}>
              {isExpired ? "✕" : timeLeft}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="label-muted">Time Remaining</span>
            <span className={twMerge("font-bold", textColor)}>
              {isExpired ? "Time's up!" : timeLeft + "s"}
            </span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: pct + "%",
                background: ringColor,
                boxShadow: isDanger ? `0 0 8px ${ringColor}` : "none",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

CountdownTimer.propTypes = {
  timerDuration: PropTypes.number,
};
