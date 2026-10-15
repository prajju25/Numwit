import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";
import { useUser } from "../contexts/UserContext";
import RoomTypeOverlay from "./RoomTypeOverlay";
import { avatars } from "../constants/constants";
import BrandMark from "./BrandMark";
import { track } from "../services/analytics";
import socket from "../socket";
import { randomProfile } from "../services/profile";

export default function Login({ onCancel }) {
  const {
    user, setUser, roomId, setHasStarted, setIsWaitingRoom,
    deviceId, setRoomType, setIsJoiningRoom,
  } = useUser();

  // Three ways in:
  //  · first visit (no profile, no invite) → random name + avatar, straight into
  //    a game against Adaptive bots — the quickest way to "get" the game;
  //  · returning player → straight to the room picker;
  //  · invite link → this form, so the player confirms who they are.
  // Names are changed later from the top-right profile menu.
  const [mode] = useState(() => (roomId ? "invite" : user?.name ? "returning" : "quickStart"));

  const quickStarted = useRef(false);
  useEffect(() => {
    if (mode !== "quickStart" || quickStarted.current) return;
    quickStarted.current = true;
    const profile = randomProfile();
    setUser({ ...profile, autoNamed: true });
    track("profile_done", { viaInvite: false, auto: true });
    track("room_join", { type: "solo", quickStart: true, botDifficulty: "adaptive" });
    setRoomType("solo");
    setIsJoiningRoom(true);
    socket.emit("join_room", { roomId: null, user: profile, roomType: "solo", deviceId, botDifficulty: "adaptive" });
  }, [mode]);

  const [showRoomChoice, setShowRoomChoice] = useState(mode === "returning");
  const [name, setName]     = useState(user?.name || "");
  const [avatar, setAvatar] = useState(user?.avatar || avatars[0]);
  const [error, setError]   = useState("");

  // Keep the form in step with the saved profile when it changes elsewhere
  // (e.g. edited from the top-right profile menu while this form is open).
  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setAvatar(user.avatar || avatars[0]);
    setError("");
  }, [user?.name, user?.avatar]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Please enter a name."); return; }
    setUser({ name: name.trim(), avatar });
    track("profile_done", { viaInvite: true });
    track("room_join", { type: "invite" });
    setHasStarted(true);
    setIsWaitingRoom(true);
  };

  const handleRandomize = () => {
    const profile = randomProfile();
    setName(profile.name);
    setAvatar(profile.avatar);
    setError("");
  };

  if (mode === "quickStart") return null; // "Joining room…" shows while the game starts

  if (mode === "returning") {
    return showRoomChoice ? (
      <RoomTypeOverlay
        onClose={() => setShowRoomChoice(false)}
        onCancel={() => { setShowRoomChoice(false); if (onCancel) onCancel(); }}
      />
    ) : null;
  }

  return (
      <div className="w-full flex items-center justify-center px-4">
        <form
          onSubmit={handleSubmit}
          className="glass-card rounded-3xl w-full max-w-md px-5 sm:px-8 py-8 sm:py-10 space-y-7 nw-rise"
        >
          {/* Title */}
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-2"><BrandMark size={128} /></div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
              Join Numwit
            </h2>
            <p className="text-white/50 text-sm">You&apos;ve been invited to a room — pick your name</p>
          </div>

          {/* Name input */}
          <div className="space-y-2">
            <label htmlFor="name" className="label-muted">Your Nickname</label>
            <input
              id="name"
              className={twMerge(
                "input-dark",
                error ? "border-red-500/60 focus:border-red-500 focus:ring-red-500/20" : ""
              )}
              value={name}
              onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setError(""); }}
              placeholder="Enter your nickname"
              autoComplete="off"
            />
            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
          </div>

          {/* Avatar picker */}
          <div className="space-y-2">
            <p className="label-muted">Choose Avatar</p>
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {avatars.map((av) => (
                <button
                  type="button"
                  key={av}
                  onClick={() => setAvatar(av)}
                  className={twMerge(
                    "text-2xl sm:text-3xl h-14 rounded-2xl border-2 transition-all duration-200 active:scale-90",
                    av === avatar
                      ? "border-violet-500 bg-violet-500/20 scale-105 shadow-lg shadow-violet-500/30"
                      : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10"
                  )}
                >
                  {av}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleRandomize}
              className="btn-secondary px-4 h-12 text-sm"
            >
              🎲 Randomize
            </button>
            <button
              type="submit"
              className="btn-primary flex-1 h-12 text-base font-extrabold"
            >
              Start Game →
            </button>
          </div>
        </form>
      </div>
  );
}

Login.propTypes = {
  onCancel: PropTypes.func,
};
