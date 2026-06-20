import React, { useState } from "react";
import PropTypes from "prop-types";
import { useNumwit } from "../contexts/NumwitRuleContext";


/**
 * TutorialOverlay
 * ─────────────────────────────────────────────────────────────────────────────
 * Progressive onboarding tooltips for rounds 1 and 2.
 * Appears as a non-blocking banner below the header.
 * Dismisses permanently for the session once the user closes it.
 *
 * Round 1 tip: explain the core rule
 * Round 2 tip: hint about psychology / strategy
 */

const TIPS = {
  1: {
    icon: "💡",
    title: "How to play",
    body: "All players pick a number 0–100. The target is 80% of the average. Closest wins! If you pick the same number as someone else (3+ players), your pick is invalid.",
  },
  2: {
    icon: "🧠",
    title: "Strategy tip",
    body: "Think about what others will pick. If everyone picks 50, the target is 40. Expect rational players to guess low — which pushes targets lower and lower. The meta shifts every game!",
  },
};

/**
 * dismissed: { [round]: bool } — controlled from GameBoard so two instances share state
 * onDismiss: (round) => void
 */
export default function TutorialOverlay({ dismissed, onDismiss }) {
  const { gameData } = useNumwit();
  // fall back to local state when used standalone (e.g. tests)
  const [localDismissed, setLocalDismissed] = useState({});

  const round = gameData?.round;
  const tip = TIPS[round];

  const isDismissed = dismissed ? dismissed[round] : localDismissed[round];
  const handleDismiss = () => {
    if (onDismiss) onDismiss(round);
    else setLocalDismissed((d) => ({ ...d, [round]: true }));
  };

  if (!tip || isDismissed) return null;

  return (
    <div className="w-full" style={{ animation: "slideDown 0.25s ease-out" }}>
      <style>{`@keyframes slideDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
        <span className="text-2xl shrink-0">{tip.icon}</span>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-indigo-800">{tip.title}</p>
          <p className="text-xs text-indigo-600 mt-0.5 leading-relaxed">{tip.body}</p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-indigo-400 hover:text-indigo-700 text-lg leading-none shrink-0"
          aria-label="Dismiss tip"
        >
          ×
        </button>
      </div>
    </div>
  );
}

TutorialOverlay.propTypes = {
  dismissed: PropTypes.object,
  onDismiss: PropTypes.func,
};
