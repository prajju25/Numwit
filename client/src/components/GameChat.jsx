import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { useChat } from "../contexts/ChatContext";
import { useUser } from "../contexts/UserContext";
import RoomChat from "./RoomChat";

const TOAST_MS = 3000;

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

/**
 * GameChat — room chat while a game is running.
 *   variant="panel": always-open side panel (desktop right rail).
 *   variant="dock":  a chat button with unread badge (mobile dock). New
 *                    messages from others pop a tappable banner; tapping
 *                    either opens a bottom sheet. The round timer keeps
 *                    running underneath, so the sheet never blocks a pick
 *                    for long.
 */
export default function GameChat({ variant = "dock" }) {
  const { messages } = useChat();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(messages.length);
  const [toast, setToast] = useState(null);
  const lastCount = useRef(messages.length);
  const mySocketId = user?.socketId ?? null;

  // Opening the sheet marks everything read.
  useEffect(() => {
    if (open) setSeen(messages.length);
  }, [open, messages.length]);

  // Banner for each new message from someone else while the sheet is closed.
  useEffect(() => {
    if (messages.length <= lastCount.current) {
      lastCount.current = messages.length;
      return undefined;
    }
    lastCount.current = messages.length;
    const latest = messages[messages.length - 1];
    if (open || variant !== "dock" || latest.socketId === mySocketId) return undefined;
    setToast(latest);
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [messages, open, variant, mySocketId]);

  if (variant === "panel") {
    return (
      <section aria-label="Room chat" className="glass-card rounded-[20px] flex flex-col h-[340px] overflow-hidden">
        <div className="px-4 pt-3.5 pb-1 flex items-center justify-between">
          <h2 className="font-display text-base font-bold m-0">Room chat</h2>
          <span className="text-[11px] text-[#8F95B8]">{messages.length} message{messages.length !== 1 ? "s" : ""}</span>
        </div>
        <RoomChat embedded className="flex-1" />
      </section>
    );
  }

  const unread = Math.max(0, messages.filter((m, i) => i >= seen && m.socketId !== mySocketId).length);
  const openSheet = () => { setToast(null); setOpen(true); };

  const sheet = open && (
    <>
      <div className="nw-fade fixed inset-0 z-50 bg-[#05060D]/60" onClick={() => setOpen(false)} aria-hidden="true" />
      <section
        role="dialog"
        aria-label="Room chat"
        className="nw-sheet fixed left-0 right-0 bottom-0 z-50 h-[min(70dvh,520px)] rounded-t-3xl flex flex-col border-t border-violet-400/35 shadow-[0_-20px_50px_rgba(0,0,0,0.6)]"
        style={{ background: "linear-gradient(180deg,#171A33,#0E1024)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex justify-center pt-2" aria-hidden="true">
          <span className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between pl-4 pr-2 py-1">
          <h2 className="font-display text-[17px] font-bold m-0">Room chat</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="w-11 h-11 rounded-xl text-[#B4B9D6] flex items-center justify-center hover:bg-white/5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>
        <RoomChat embedded className="flex-1" />
      </section>
    </>
  );

  const overlayRoot = typeof document !== "undefined" ? document.getElementById("overlay-root") : null;

  return (
    <>
      {toast && !open && (
        <button
          onClick={openSheet}
          className="nw-toast fixed top-[68px] left-3 right-3 z-40 flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border border-violet-400/45 text-left shadow-[0_12px_30px_-10px_rgba(0,0,0,0.7)]"
          style={{ background: "rgba(30,27,75,.94)", backdropFilter: "blur(14px)" }}
        >
          <span className="text-xl">{toast.avatar}</span>
          <span className="flex-1 min-w-0 text-[13px] truncate">
            <strong>{toast.name}</strong> <span className="text-[#C7CBE6]">{toast.message}</span>
          </span>
          <span className="text-[11px] font-bold text-violet-300">Reply</span>
        </button>
      )}

      <button
        onClick={openSheet}
        aria-label={unread > 0 ? `Open room chat, ${unread} unread` : "Open room chat"}
        className="relative w-[52px] h-[52px] shrink-0 rounded-2xl border border-violet-400/45 bg-violet-500/15 text-violet-200 flex items-center justify-center transition active:scale-95"
      >
        <ChatIcon />
        {unread > 0 && (
          <span key={unread} className="nw-pop nums absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-400 border-2 border-[#0B0E1C] text-[11px] font-extrabold text-white flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {sheet && (overlayRoot ? ReactDOM.createPortal(sheet, overlayRoot) : sheet)}
    </>
  );
}

GameChat.propTypes = {
  variant: PropTypes.oneOf(["dock", "panel"]),
};
