import React, { useState } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { useUser } from "../contexts/UserContext";
import socket from "../socket";
import { track } from "../services/analytics";
import { BOT_DIFFICULTIES } from "../constants/constants";

const DIFFICULTY_KEY = "numwit_bot_difficulty";

function loadDifficulty() {
  try {
    const saved = localStorage.getItem(DIFFICULTY_KEY);
    if (BOT_DIFFICULTIES.some((d) => d.id === saved)) return saved;
  } catch {
    // storage unavailable — fall back to the default
  }
  return "adaptive";
}

export default function RoomTypeOverlay({ onClose, onCancel }) {
  const { user, deviceId, setRoomType, setIsJoiningRoom, roomId } = useUser();
  const [pickingDifficulty, setPickingDifficulty] = useState(false);
  const [difficulty, setDifficulty] = useState(loadDifficulty);

  const handleRoomSelection = (type, extra) => {
    track("room_join", { type, ...extra });
    setRoomType(type);
    setIsJoiningRoom(true);
    socket.emit("join_room", { roomId, user, roomType: type, deviceId, ...extra });
    onClose();
  };

  const startSolo = () => {
    try {
      localStorage.setItem(DIFFICULTY_KEY, difficulty);
    } catch {
      // not critical
    }
    handleRoomSelection("solo", { botDifficulty: difficulty });
  };

  const difficultyStep = (
    <div className="glass-card rounded-3xl w-full max-w-sm p-6 sm:p-8 nw-rise space-y-5 text-center">
      <div>
        <div className="text-4xl mb-3">🤖</div>
        <h2 className="font-display text-2xl font-bold text-white">How tough?</h2>
        <p className="text-white/50 text-sm mt-1">The bots learn from how you play</p>
      </div>

      <div role="radiogroup" aria-label="Bot difficulty" className="space-y-2 text-left">
        {BOT_DIFFICULTIES.map((d) => {
          const active = d.id === difficulty;
          return (
            <button
              key={d.id}
              role="radio"
              aria-checked={active}
              onClick={() => setDifficulty(d.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 active:scale-[0.98] ${
                active
                  ? "border-violet-400/70 bg-violet-500/15 shadow-[0_0_0_1px_rgba(139,92,246,0.35)]"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              <span className="text-2xl" aria-hidden="true">{d.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-sm text-white">
                  {d.label}
                  {d.id === "adaptive" && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-cyan-300">Recommended</span>
                  )}
                </span>
                <span className="block text-xs text-white/50">{d.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      <button onClick={startSolo} className="w-full h-12 px-4 rounded-xl font-bold text-sm btn-primary">
        Start game
      </button>
      <button
        onClick={() => setPickingDifficulty(false)}
        className="min-h-[44px] px-4 text-sm text-white/40 hover:text-white/70 transition"
      >
        Back
      </button>
    </div>
  );

  const roomTypeStep = (
    <div className="glass-card rounded-3xl w-full max-w-sm p-6 sm:p-8 nw-rise space-y-6 text-center">
      <div>
        <div className="text-4xl mb-3">🏠</div>
        <h2 className="font-display text-2xl font-bold text-white">Choose Room Type</h2>
        <p className="text-white/50 text-sm mt-1">Start a new game session</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => handleRoomSelection("public")}
          className="flex-1 h-12 px-4 rounded-xl font-bold text-sm transition-all duration-200 active:scale-95 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20"
          style={{ background: "rgba(16,185,129,0.12)" }}
        >
          🌍 Public Room
        </button>
        <button
          onClick={() => handleRoomSelection("private")}
          className="flex-1 h-12 px-4 rounded-xl font-bold text-sm btn-primary"
        >
          🔒 Private Room
        </button>
      </div>

      <button
        onClick={() => setPickingDifficulty(true)}
        className="w-full h-12 px-4 rounded-xl font-bold text-sm transition-all duration-200 active:scale-95 border border-sky-500/40 text-sky-300 hover:bg-sky-500/20"
        style={{ background: "rgba(14,165,233,0.12)" }}
      >
        🤖 Play vs Computer
      </button>

      <button onClick={onCancel || onClose} className="min-h-[44px] px-4 text-sm text-white/40 hover:text-white/70 transition">
        Cancel
      </button>
    </div>
  );

  const overlayContent = (
    <div className="fixed inset-0 z-50 bg-[#05060D]/75 backdrop-blur-sm flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0 nw-fade">
      {pickingDifficulty ? difficultyStep : roomTypeStep}
    </div>
  );

  const rootModal = document.getElementById("overlay-root");
  return rootModal ? ReactDOM.createPortal(overlayContent, rootModal) : overlayContent;
}

RoomTypeOverlay.propTypes = {
  onClose: PropTypes.func.isRequired,
  // Cancel button only; defaults to onClose
  onCancel: PropTypes.func,
};
