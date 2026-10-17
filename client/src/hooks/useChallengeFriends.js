import { useCallback } from "react";
import socket from "../socket";
import { useUser } from "../contexts/UserContext";
import { useGame } from "../contexts/GameContext";
import { track } from "../services/analytics";

// The challenge message waits here until the new room's waiting room shows it
export const CHALLENGE_KEY = "numwit_challenge";
const LEAVE_TIMEOUT_MS = 1500;

export function readChallenge() {
  try { return sessionStorage.getItem(CHALLENGE_KEY); } catch { return null; }
}

export function clearChallenge() {
  try { sessionStorage.removeItem(CHALLENGE_KEY); } catch { /* not critical */ }
}

/**
 * "Challenge friends" from the game-over screen: leave the finished game,
 * open a new private room, and have its waiting room offer the message (with
 * the invite link) to send.
 *
 * The new room is only requested once the server confirms the leave — a late
 * leave would otherwise remove the player from the room they just created.
 * The share sheet is opened from a tap in the waiting room, not here: phones
 * only allow it right after a tap, and the room takes a moment to exist.
 */
export default function useChallengeFriends() {
  const {
    user, deviceId, setRoomId, setRoomType, setIsInGame, setIsWaitingRoom, setIsJoiningRoom,
  } = useUser();
  const { resetGame } = useGame();

  return useCallback((message, data) => {
    track("challenge_start", data);
    try { sessionStorage.setItem(CHALLENGE_KEY, message); } catch { /* the room still opens */ }

    let started = false;
    const openRoom = () => {
      if (started) return;
      started = true;
      resetGame?.();
      setIsInGame(false);
      setIsWaitingRoom(false);
      setRoomId(null);
      setRoomType("private");
      setIsJoiningRoom(true);
      socket.emit("join_room", { roomId: null, user, roomType: "private", deviceId });
    };
    socket.emit("leave_room", openRoom);
    setTimeout(openRoom, LEAVE_TIMEOUT_MS); // no answer from the server — go anyway
  }, [user, deviceId, resetGame, setRoomId, setRoomType, setIsInGame, setIsWaitingRoom, setIsJoiningRoom]);
}
