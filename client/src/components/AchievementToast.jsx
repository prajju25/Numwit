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
    <div className="fixed bottom-6 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            "flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl max-w-xs animate-fadeIn pointer-events-auto",
            t.type === "levelup"
              ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
              : "bg-gradient-to-r from-amber-500 to-yellow-400 text-white",
          ].join(" ")}
        >
          <span className="text-2xl shrink-0">{t.icon}</span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide opacity-80">{t.title}</p>
            <p className="text-sm font-semibold leading-tight">{t.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
