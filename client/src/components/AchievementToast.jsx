import React, { useEffect, useState } from "react";
import socket from "../socket";

/**
 * AchievementToast
 * ─────────────────────────────────────────────────────────────────────────────
 * Listens for `achievement_unlocked` and `xp_update` socket events.
 * Shows a stacked list of toast notifications that auto-dismiss after 5 s.
 */

const TOAST_DURATION = 5000;

export default function AchievementToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const addToast = (toast) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, ...toast }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_DURATION);
    };

    const onAchievementUnlocked = (data) => {
      addToast({
        type:  "achievement",
        icon:  data.icon,
        title: "Achievement Unlocked!",
        body:  `${data.name} — ${data.description}`,
      });
    };

    const onXpUpdate = (data) => {
      if (data?.levelUp) {
        addToast({
          type:  "levelup",
          icon:  "⬆️",
          title: "Level Up!",
          body:  `You reached Level ${data.level}  ·  +${data.xpGained} XP`,
        });
      }
    };

    socket.on("achievement_unlocked", onAchievementUnlocked);
    socket.on("xp_update",            onXpUpdate);

    return () => {
      socket.off("achievement_unlocked", onAchievementUnlocked);
      socket.off("xp_update",            onXpUpdate);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 sm:top-auto sm:bottom-6 left-3 right-3 sm:left-auto sm:right-4 z-[55] flex flex-col gap-2 items-stretch sm:items-end pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            "nw-pop flex items-start gap-3 px-4 py-3 rounded-2xl sm:max-w-xs pointer-events-auto border backdrop-blur-md shadow-[0_14px_34px_-12px_rgba(0,0,0,0.7)]",
            t.type === "levelup"
              ? "bg-violet-950/90 border-violet-400/50 text-white"
              : "bg-[#1f1a0a]/90 border-amber-400/50 text-white",
          ].join(" ")}
        >
          <span className={[
            "w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-lg",
            t.type === "levelup" ? "bg-gradient-to-br from-violet-600 to-violet-400" : "bg-gradient-to-br from-amber-500 to-amber-300",
          ].join(" ")}>{t.icon}</span>
          <div>
            <p className={`text-[11px] font-extrabold uppercase tracking-wider m-0 ${t.type === "levelup" ? "text-violet-300" : "text-amber-300"}`}>{t.title}</p>
            <p className="text-sm font-semibold leading-tight m-0 mt-0.5">{t.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
