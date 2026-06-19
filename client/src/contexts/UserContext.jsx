import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import PropTypes from "prop-types";

const UserContext = createContext();

// ── deviceId: stable UUID per browser, persisted in localStorage ─────────────
function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem("80p-device-id");
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
          });
      localStorage.setItem("80p-device-id", id);
    }
    return id;
  } catch (_) {
    return null;
  }
}

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("80Percentile-user");
      return stored ? JSON.parse(stored) : null;
    } catch (_) {
      return null;
    }
  });
  const [deviceId]        = useState(() => getOrCreateDeviceId());
  const [hasStarted,       setHasStarted]      = useState(false);
  const [roomType,         setRoomType]        = useState(null);
  const [isInGame,         setIsInGame]        = useState(false);
  const [isWaitingRoom,    setIsWaitingRoom]   = useState(false);
  const [roomId,           setRoomId]          = useState(null);
  const [isJoiningRoom,    setIsJoiningRoom]   = useState(false);

  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem("80Percentile-user", JSON.stringify(user));
      } else {
        localStorage.removeItem("80Percentile-user");
      }
    } catch (err) {
      // Storage full or unavailable — the session just won't persist across
      // reloads; not worth interrupting the user with an error for this.
      console.warn("Failed to persist user session:", err.message);
    }
  }, [user]);

  const resetUser = useCallback(() => {
    setRoomId(null);
    setIsInGame(false);
    setIsWaitingRoom(false);
    setRoomType(null);
    setHasStarted(false);
    setIsJoiningRoom(false);
  }, []);

  const providerValue = useMemo(
    () => ({
      user,
      setUser,
      deviceId,
      hasStarted,
      setHasStarted,
      roomType,
      setRoomType,
      isInGame,
      setIsInGame,
      isWaitingRoom,
      setIsWaitingRoom,
      roomId,
      setRoomId,
      resetUser,
      isJoiningRoom,
      setIsJoiningRoom,
    }),
    [user, deviceId, hasStarted, roomType, isInGame, isWaitingRoom, roomId, isJoiningRoom, resetUser]
  );

  return (
    <UserContext.Provider value={providerValue}>
      {children}
    </UserContext.Provider>
  );
};

UserProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useUser = () => useContext(UserContext);
