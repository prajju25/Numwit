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

export default function TutorialOverlay() {
  const { gameData } = useNumwit();
  const [dismissed, setDismissed] = useState({});

  const round = gameData && gameData.round;
  const tip = TIPS[round];

  if (!tip || dismissed[round]) return null;

  return (
    <div className="w-full animate-fadeIn">
      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
        <span className="text-2xl shrink-0">{tip.icon}</span>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-indigo-800">{tip.title}</p>
          <p className="text-xs text-indigo-600 mt-0.5 leading-relaxed">{tip.body}</p>
        </div>
        <button
          onClick={() => setDismissed((d) => ({ ...d, [round]: true }))}
          className="text-indigo-400 hover:text-indigo-700 text-lg leading-none shrink-0"
          aria-label="Dismiss tip"
        >
          ×
        </button>
      </div>
    </div>
  );
}

TutorialOverlay.propTypes = {};
