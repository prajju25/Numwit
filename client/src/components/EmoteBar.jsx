import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import socket from "../socket";
import { useUser } from "../contexts/UserContext";

const EMOTES = ["😂", "😱", "🔥", "💀", "🤔", "👏"];
const TOAST_DURATION_MS = 2500;

/**
 * EmoteBar
 * ─────────────────────────────────────────────────────────────────────────────
 * Row of quick-react emoji buttons. Incoming emotes float up as toasts.
 */
export default function EmoteBar() {
  const { roomId } = useUser();
  const [toasts, setToasts] = useState([]);   // [{ id, name, avatar, emote }]
  const [cooldown, setCooldown] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on("emote_received", (data) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, ...data }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_DURATION_MS);
    });

    return () => socket.off("emote_received");
  }, []);

  const sendEmote = (emote) => {
    if (cooldown) return;
    socket.emit("send_emote", { roomId, emote });
    setCooldown(true);
    setTimeout(() => setCooldown(false), 1200);
  };

  return (
    <div className="relative w-full">
      {/* Floating toasts */}
      <div className="absolute bottom-full left-0 right-0 pointer-events-none flex flex-col-reverse items-start gap-1 pb-1 max-h-32 overflow-hidden">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-1 bg-white border border-gray-100 rounded-full px-3 py-1 shadow-md text-sm animate-fadeIn"
          >
            <span>{t.avatar}</span>
            <span className="text-gray-600 font-medium">{t.name}</span>
            <span className="text-lg">{t.emote}</span>
          </div>
        ))}
      </div>

      {/* Emote buttons */}
      <div className="flex items-center justify-center gap-2 py-2 border-t border-gray-100">
        {EMOTES.map((emote) => (
          <button
            key={emote}
            onClick={() => sendEmote(emote)}
            disabled={cooldown}
            className={
              "text-xl sm:text-2xl p-1.5 rounded-full transition-transform " +
              (cooldown ? "opacity-50 cursor-not-allowed" : "hover:scale-125 active:scale-95")
            }
            title={emote}
          >
            {emote}
          </button>
        ))}
      </div>
    </div>
  );
}

EmoteBar.propTypes = {};
