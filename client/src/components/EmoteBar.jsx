import React, { useEffect, useState } from "react";
import socket from "../socket";
import { useUser } from "../contexts/UserContext";

const EMOTES = ["😂", "😱", "🔥", "💀", "🤔", "👏"];
const TOAST_DURATION_MS = 2500;

/**
 * EmoteBar
 * ─────────────────────────────────────────────────────────────────────────────
 * Row of quick-react emoji buttons. Incoming emotes (including your own,
 * echoed by the server) float up across the screen with the sender's name.
 */
export default function EmoteBar() {
  const { roomId } = useUser();
  const [toasts, setToasts] = useState([]);   // [{ id, name, avatar, emote, x }]
  const [cooldown, setCooldown] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on("emote_received", (data) => {
      const id = Date.now() + Math.random();
      // Spread reactions across the lower screen so bursts don't stack
      const x = 8 + Math.round(Math.random() * 76);
      setToasts((prev) => [...prev, { id, x, ...data }]);
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
    <div className="w-full">
      {/* Floating reactions */}
      <div aria-live="polite" className="fixed left-0 right-0 bottom-28 h-0 pointer-events-none z-[60]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="nw-float-up absolute bottom-0 flex flex-col items-center"
            style={{ left: `${t.x}%` }}
          >
            <span className="text-[34px] leading-none drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)]">{t.emote}</span>
            <span className="mt-1 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-[10px] font-bold text-white whitespace-nowrap">
              <span>{t.avatar}</span>
              <span>{t.name}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Emote buttons */}
      <div className="flex items-center justify-between gap-0.5 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
        {EMOTES.map((emote) => (
          <button
            key={emote}
            onClick={() => sendEmote(emote)}
            disabled={cooldown}
            className={
              "flex-1 h-11 min-w-[40px] text-[22px] rounded-xl transition-transform duration-150 " +
              (cooldown ? "opacity-40 cursor-not-allowed" : "hover:scale-125 hover:bg-white/5 active:scale-90")
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
