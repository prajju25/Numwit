import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";
import { useUser } from "../contexts/UserContext";
import { avatars } from "../constants/constants";
import socket from "../socket";
import { OPEN_PROFILE_EVENT } from "../services/profile";

/**
 * Top-right profile chip. Opens a small flyout to change nickname and avatar —
 * also mid-game: the server renames the player in their room for everyone.
 * Players with an auto-generated name (quick start) get a "Set name" nudge.
 * Renders nothing until the player has a profile.
 */
export default function ProfileMenu({ className }) {
  const { user, setUser } = useUser() || {};
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(avatars[0]);
  const [error, setError] = useState("");
  const rootRef = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;

  // Other screens can open the menu (e.g. a "change name" hint)
  useEffect(() => {
    const onOpen = () => {
      const u = userRef.current;
      if (!u) return;
      setName(u.name || "");
      setAvatar(u.avatar || avatars[0]);
      setError("");
      setOpen(true);
    };
    window.addEventListener(OPEN_PROFILE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PROFILE_EVENT, onOpen);
  }, []);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const toggle = () => {
    if (!open) {
      setName(user.name || "");
      setAvatar(user.avatar || avatars[0]);
      setError("");
    }
    setOpen(!open);
  };

  const save = (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Please enter a name."); return; }
    const { autoNamed, ...rest } = user; // eslint-disable-line no-unused-vars
    const next = { ...rest, name: name.trim(), avatar };
    setUser(next);
    socket.emit("update_profile", { name: next.name, avatar: next.avatar });
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={twMerge("relative", className)}>
      <button
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Edit profile"
        className="flex items-center gap-2 h-11 px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
      >
        <span className="text-lg" aria-hidden="true">{user.avatar}</span>
        <span className="hidden sm:inline font-semibold text-white text-sm max-w-[120px] truncate">{user.name}</span>
        {user.autoNamed && (
          <>
            {/* Phones: a dot — the full badge crowds the in-game header */}
            <span className="sm:hidden w-2 h-2 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.8)]" aria-label="Set name" />
            <span className="hidden sm:inline text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md text-amber-200 bg-amber-400/15 border border-amber-400/40">
              Set name
            </span>
          </>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="text-white/50" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <form
          role="dialog"
          aria-label="Edit profile"
          onSubmit={save}
          className="absolute right-0 top-full mt-2 z-50 w-[min(18rem,calc(100vw-2rem))] glass-card rounded-2xl p-4 space-y-4 nw-rise text-left"
          style={{ background: "rgba(17,20,38,0.97)" }}
        >
          <div className="space-y-1.5">
            <label htmlFor="profile-name" className="label-muted">Nickname</label>
            <input
              id="profile-name"
              className={twMerge("input-dark", error ? "border-red-500/60" : "")}
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
            />
            {error && <p className="text-xs text-red-400 m-0">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <span className="label-muted">Avatar</span>
            <div className="grid grid-cols-4 gap-2">
              {avatars.map((a) => (
                <button
                  type="button"
                  key={a}
                  aria-label={`Avatar ${a}`}
                  aria-pressed={a === avatar}
                  onClick={() => setAvatar(a)}
                  className={twMerge(
                    "h-11 rounded-xl text-xl border transition",
                    a === avatar
                      ? "border-violet-400/80 bg-violet-500/20"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08]"
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="w-full h-11 rounded-xl font-bold text-sm btn-primary">
            Save
          </button>
        </form>
      )}
    </div>
  );
}

ProfileMenu.propTypes = {
  className: PropTypes.string,
};
