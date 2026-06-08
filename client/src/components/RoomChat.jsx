import React, { useEffect, useRef, useState } from "react";
import { useChat } from "../contexts/ChatContext";
import { useUser } from "../contexts/UserContext";
import { useGame } from "../contexts/GameContext";
import socket from "../socket";

export default function RoomChat() {
  const { roomId, user } = useUser();
  const { players } = useGame();
  const { messages, rateLimited, sendMessage } = useChat();
  const [draft, setDraft] = useState("");
  const [typingSocketIds, setTypingSocketIds] = useState([]);
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/10 label-muted"
        style={{ background: "rgba(255,255,255,0.05)" }}>
        💬 Room Chat
      </div>

      {/* Messages */}
      <div className="overflow-y-auto max-h-40 p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-white/30 text-center py-4">No messages yet — say hi! 👋</p>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.socketId === mySocketId;
          return (
            <div key={i} className={`flex items-start gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
              <span className="text-lg shrink-0">{msg.avatar}</span>
              <div className={`max-w-[75%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && <span className="text-[10px] text-white/35 mb-0.5">{msg.name}</span>}
                <span className={`text-sm px-3 py-1.5 rounded-2xl break-words ${
                  isMe
                    ? "bg-violet-600 text-white rounded-tr-sm"
                    : "bg-white/10 border border-white/10 text-white/80 rounded-tl-sm"
                }`}>
                  {msg.message}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Typing */}
      {typingLabel && (
        <div className="px-4 py-1 text-[10px] text-white/35 italic border-t border-white/5">
          {typingLabel}
        </div>
      )}

      {/* Rate limit */}
      {rateLimited && (
        <div className="px-4 py-1 text-xs text-amber-400 border-t border-amber-500/20"
          style={{ background: "rgba(245,158,11,0.08)" }}>
          ⚠️ {rateLimited}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 p-3 border-t border-white/10"
        style={{ background: "rgba(255,255,255,0.03)" }}>
        <input
          type="text"
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKey}
          maxLength={200}
          placeholder="Type a message…"
          className="flex-1 text-sm px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:outline-none focus:border-violet-400 transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim()}
          className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white font-bold disabled:opacity-30 hover:bg-violet-500 transition"
        >
          Send
        </button>
      </div>
    </div>
  );
}
