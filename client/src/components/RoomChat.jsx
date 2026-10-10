import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";
import { useChat } from "../contexts/ChatContext";
import { useUser } from "../contexts/UserContext";
import { useGame } from "../contexts/GameContext";
import socket from "../socket";

/**
 * RoomChat — room-wide text chat.
 *   embedded=false (default): standalone glass card (WaitingRoom).
 *   embedded=true: no card chrome or header; fills its parent's height
 *   (in-game chat sheet on mobile, side panel on desktop).
 */
export default function RoomChat({ embedded = false, className }) {
  const { roomId, user } = useUser();
  const { players } = useGame();
  const { messages, rateLimited, sendMessage } = useChat();
  const [draft, setDraft] = useState("");
  const [typingSocketIds, setTypingSocketIds] = useState([]);
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  useEffect(() => {
    const onTyping = ({ socketId, isTyping }) => {
      setTypingSocketIds((prev) =>
        isTyping
          ? prev.includes(socketId) ? prev : [...prev, socketId]
          : prev.filter((id) => id !== socketId)
      );
    };
    socket.on("player_typing", onTyping);
    return () => socket.off("player_typing", onTyping);
  }, []);

  const emitTypingStart = () => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit("typing_start", { roomId });
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit("typing_stop", { roomId });
    }, 2500);
  };

  const emitTypingStop = () => {
    clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      socket.emit("typing_stop", { roomId });
    }
  };

  const handleSend = () => {
    if (!draft.trim()) return;
    emitTypingStop();
    sendMessage(roomId, draft);
    setDraft("");
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleChange = (e) => {
    setDraft(e.target.value);
    if (e.target.value.trim()) emitTypingStart(); else emitTypingStop();
  };

  const mySocketId = user?.socketId ?? null;

  const typingNames = typingSocketIds
    .filter((id) => id !== mySocketId)
    .map((id) => players?.find((pl) => pl.socketId === id)?.name)
    .filter(Boolean);

  const typingLabel = typingNames.length === 1 ? `${typingNames[0]} is typing…`
    : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing…`
    : typingNames.length > 2  ? "Several people are typing…"
    : null;

  return (
    <div
      data-room-chat
      className={twMerge(
        embedded ? "flex flex-col min-h-0" : "glass-card rounded-[18px] overflow-hidden flex flex-col",
        className
      )}
    >
      {/* Header */}
      {!embedded && (
        <div className="px-4 pt-3.5 pb-1 font-display text-base font-bold">
          💬 Room Chat
        </div>
      )}

      {/* Messages */}
      <div className={twMerge("overflow-y-auto px-3.5 py-2 flex flex-col gap-2", embedded ? "flex-1 min-h-0" : "max-h-48")}>
        {messages.length === 0 && (
          <p className="text-xs text-[#8F95B8] text-center py-4 m-0">No messages yet — say hi! 👋</p>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.socketId === mySocketId;
          return (
            <div key={i} className={`nw-msg flex items-end gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
              <span className="text-lg shrink-0 leading-none">{msg.avatar}</span>
              <div className={`max-w-[78%] px-3 py-1.5 text-sm leading-snug break-words ${
                isMe
                  ? "bg-violet-600/80 text-white rounded-[14px_14px_4px_14px]"
                  : "bg-white/[0.07] text-white/90 rounded-[14px_14px_14px_4px]"
              }`}>
                {!isMe && <span className="block text-[10px] font-bold text-[#A3A8C7]">{msg.name}</span>}
                <span>{msg.message}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Typing */}
      {typingLabel && (
        <div className="px-4 py-1 flex items-center gap-2 text-[11px] text-[#8F95B8]">
          <span className="nw-typing" aria-hidden="true"><span /><span /><span /></span>
          {typingLabel}
        </div>
      )}

      {/* Rate limit */}
      {rateLimited && (
        <div className="mx-3.5 mt-1 px-3 py-1.5 rounded-lg text-xs text-amber-300 border border-amber-500/25 bg-amber-500/10">
          ⚠️ {rateLimited}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 m-3 h-12 pl-3.5 pr-1.5 rounded-xl bg-black/30 border border-white/10 focus-within:border-violet-400/60 transition-colors">
        <input
          type="text"
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKey}
          maxLength={200}
          aria-label="Chat message"
          placeholder="Type a message…"
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] text-white placeholder:text-white/30"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim()}
          className="h-9 px-3.5 rounded-[10px] bg-violet-600 text-white text-sm font-bold disabled:opacity-30 hover:bg-violet-500 transition active:scale-95"
        >
          Send
        </button>
      </div>
    </div>
  );
}

RoomChat.propTypes = {
  embedded: PropTypes.bool,
  className: PropTypes.string,
};
