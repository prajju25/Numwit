/**
 * profile.js — helpers for the player's local profile.
 */
import { avatars } from "../constants/constants";

/** A throwaway profile for players who haven't picked a name yet. */
export function randomProfile(rng = Math.random) {
  return {
    name: `Player${Math.floor(100 + rng() * 900)}`,
    avatar: avatars[Math.floor(rng() * avatars.length)],
  };
}

// Lets any screen open the top-right profile menu (e.g. "change name" hints)
export const OPEN_PROFILE_EVENT = "numwit:open-profile";

export function openProfileMenu() {
  window.dispatchEvent(new Event(OPEN_PROFILE_EVENT));
}
