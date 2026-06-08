import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import PropTypes from "prop-types";
import socket from "../socket";
import { useUser } from "./UserContext";
import { MIN_PLAYERS } from "../constants/constants";

const GameContext = createContext();

export const GameProvider = ({ children }) => {
  const {
    setIsInGame,
    setIsWaitingRoom,
    roomType,
    setRoomId,
    setHasStarted,
    setIsJoiningRoom,
  } = useUser();

  const [players,          setPlayers]          = useState([]);
  const [hostSocketId,     setHostSocketId]     = useState(null);
  const [spectatorSnapshot, setSpectatorSnapshot] = useState(null);

  useEffect(() => {
    const onRoomUpdate = (room) => {
      setRoomId(room.id);
      setPlayers(room.users);
      setHasStarted(true);
      setIsJoiningRoom(false);
      if (room.hostSocketId) setHostSocketId(room.hostSocketId);

      if (room.users.length >= MIN_PLAYERS && roomType === "public") {
        setIsInGame(true);
        setIsWaitingRoom(false);
      } else {
        setIsWaitingRoom(true);
      }
    };

    const onGameStarted = () => {
      setIsInGame(true);
      setIsWaitingRoom(false);
    };

    // game_reset: host clicked "Play Again" → everyone returns to WaitingRoom.
    // The host will click Start Game again when ready.
    const onGameReset = () => {
      setIsInGame(false);
      setIsWaitingRoom(true);
    };

    // game_in_progress: received by a player who joins while a game is running.
    // Store the snapshot for NumwitRuleContext to read on mount, then navigate to GameBoard.
    const onGameInProgress = (data) => {
      setSpectatorSnapshot(data);
      setIsInGame(true);
      setIsWaitingRoom(false);
    };

    socket.on("room_update",     onRoomUpdate);
    socket.on("game_started",    onGameStarted);
    socket.on("game_reset",      onGameReset);
    socket.on("game_in_progress", onGameInProgress);

    return () => {
      socket.off("room_update",     onRoomUpdate);
      socket.off("game_started",    onGameStarted);
      socket.off("game_reset",      onGameReset);
      socket.off("game_in_progress", onGameInProgress);
    };
  // roomType is intentionally excluded: it's set once on mount and never changes
  // after the user joins. Including it would cause the effect to re-register on
  // every public/private toggle, which is not needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetGame = useCallback(() => {
    setPlayers([]);
    setHostSocketId(null);
  }, []);

  const clearSpectatorSnapshot = useCallback(() => setSpectatorSnapshot(null), []);

  const providerValue = useMemo(
    () => ({ players, hostSocketId, resetGame, spectatorSnapshot, clearSpectatorSnapshot }),
    [players, hostSocketId, resetGame, spectatorSnapshot, clearSpectatorSnapshot]
  );

  return (
    <GameContext.Provider value={providerValue}>
      {children}
    </GameContext.Provider>
  );
};

GameProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useGame = () => useContext(GameContext);
