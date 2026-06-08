import React, { useState } from "react";
import PropTypes from "prop-types";

/**
 * ShareResults
 * ─────────────────────────────────────────────────────────────────────────────
 * Formats the session as a shareable emoji grid (à la Wordle) and copies
 * it to the clipboard.
 *
 * Props:
 *   history    {Array}  — round results from NumwitRuleContext
 *   mySocketId {string}
 *   players    {Array}
 */
export default function ShareResults({ history, mySocketId, players }) {
  const [copied, setCopied] = useState(false);

  if (!history || history.length === 0) return null;

  const buildText = () => {
    const header = "🧠 Numwit";
    const sub = history.length + " round" + (history.length !== 1 ? "s" : "");

    const rows = history.map((r) => {
      const iWon = r.winnerIds && r.winnerIds.includes(mySocketId);
      const isInvalid = r.invalidSubmissions && r.invalidSubmissions.some((s) => s.socketId === mySocketId);
      const mySubmission = r.submissions && r.submissions.find((s) => s.socketId === mySocketId);

      let icon = iWon ? "🏆" : isInvalid ? "❌" : "💀";
      if (r.exactMatch && iWon) icon = "⚡";

      const target = r.target != null ? r.target.toFixed(1) : "?";
      const pick = mySubmission ? String(mySubmission.number) : "?";

      return "R" + r.round + " " + icon + " | Target: " + target + " | You: " + pick;
    });

    const myWins = history.filter((r) => r.winnerIds && r.winnerIds.includes(mySocketId)).length;
    const footer = myWins + "/" + history.length + " wins · Play at " + window.location.origin;

    return [header, sub, "", ...rows, "", footer].join("\n");
  };

  const handleCopy = () => {
    const text = buildText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback: show text in prompt
      window.prompt("Copy your results:", text);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className={
        "w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 border " +
        (copied
          ? "bg-green-50 border-green-300 text-green-700"
          : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")
      }
    >
      {copied ? "✅ Copied to clipboard!" : "📋 Share Results"}
    </button>
  );
}

ShareResults.propTypes = {
  history: PropTypes.array,
  mySocketId: PropTypes.string,
  players: PropTypes.array,
};
