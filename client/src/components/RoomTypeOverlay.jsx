import React from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { useUser } from "../contexts/UserContext";
import socket from "../socket";

export default function RoomTypeOverlay({ onClose }) {
  const { user, setRoomType, setIsJoiningRoom, roomId } = useUser();

  const handleRoomSelection = (type) => {
    setRoomType(type);
    setIsJoiningRoom(true);
    socket.emit("join_room", { roomId, user, roomType: type });
    onClose();
  };

  const overlayContent = (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="glass-card w-full max-w-sm p-8 animate-fadeIn space-y-6 text-center">
        <div>
          <div className="text-4xl mb-3">🏠</div>
          <h2 className="text-2xl font-extrabold text-white">Choose Room Type</h2>
          <p className="text-white/50 text-sm mt-1">Start a new game session</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => handleRoomSelection("public")}
            className="flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-200 active:scale-95 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20"
            style={{ background: "rgba(16,185,129,0.12)" }}
          >
            🌍 Public Room
          </button>
          <button
            onClick={() => handleRoomSelection("private")}
            className="flex-1 py-3 px-4 rounded-xl font-bold text-sm btn-primary"
          >
            🔒 Private Room
          </button>
        </div>

        <button
          onClick={() => handleRoomSelection("solo")}
          className="w-full py-3 px-4 rounded-xl font-bold text-sm transition-all duration-200 active:scale-95 border border-sky-500/40 text-sky-300 hover:bg-sky-500/20"
          style={{ background: "rgba(14,165,233,0.12)" }}
        >
          🤖 Play vs Computer
        </button>

        <button onClick={onClose} className="text-xs text-white/30 hover:text-white/60 transition">
          Cancel
        </button>
      </div>
    </div>
  );

  const rootModal = document.getElementById("overlay-root");
  return rootModal ? ReactDOM.createPortal(overlayContent, rootModal) : overlayContent;
}

RoomTypeOverlay.propTypes = {
  onClose: PropTypes.func.isRequired,
};
