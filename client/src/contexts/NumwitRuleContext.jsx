import PropTypes from "prop-types";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import socket from "../socket";
import { useGame } from "./GameContext";

const NumwitRuleContext = createContext();

export const NumwitRuleProvider = ({ children }) => {
  const { spectatorSnapshot, clearSpectatorSnapshot } = useGame();

  const [gameData,          setGameData]          = useState({});
  const [roundResult,       setRoundResult]       = useState(null);
  const [roundVoid,         setRoundVoid]         = useState(null);
  const [submitted,         setSubmitted]         = useState(false);
  const [selectedNumber,    setSelectedNumber]    = useState(null);
  const [waitingCount,      setWaitingCount]      = useState(null);
  const [gameOver,          setGameOver]          = useState(null);
  const [eliminatedPlayers, setEliminatedPlayers] = useState([]);
  const [alert,             setAlert]             = useState(null);
  const [history,           setHistory]           = useState([]);
  const [hostSocketId,      setHostSocketId]      = useState(null);
  const [timerExpired,      setTimerExpired]      = useState(false);
  // timerKey increments every time the server starts a fresh timer —
  // on next_round AND on round_void (server restarts same-round timer).
  // Used as part of CountdownTimer's key to force a clean remount.
  const [timerKey,          setTimerKey]          = useState(0);

  // If this provider mounted because the user rejoined mid-game, GameContext
  // will have stored a snapshot in spectatorSnapshot before the mount happened.
  // Read it once on mount so the board renders with the current game state.
  useEffect(() => {
    if (!spectatorSnapshot) return;
    setGameData(spectatorSnapshot);
    if (spectatorSnapshot.eliminatedPlayers) setEliminatedPlayers(spectatorSnapshot.eliminatedPlayers);
    if (spectatorSnapshot.hostSocketId)      setHostSocketId(spectatorSnapshot.hostSocketId);
    setTimerKey((k) => k + 1);
    clearSpectatorSnapshot();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onNextRound = (data) => {
      setGameData(data);
      setRoundResult(null);
      setRoundVoid(null);
      setSubmitted(false);
      setSelectedNumber(null);
      setWaitingCount(null);
      setTimerExpired(false);
      setTimerKey((k) => k + 1);
      if (data.eliminatedPlayers) setEliminatedPlayers(data.eliminatedPlayers);
      if (data.hostSocketId)      setHostSocketId(data.hostSocketId);
    };

    const onWaitingForPlayers = ({ submitted: s, total }) => {
      setWaitingCount({ submitted: s, total });
    };

    const onRoundVoid = (data) => {
      setRoundVoid(data);
      setSubmitted(false);
      setSelectedNumber(null);
      setWaitingCount(null);
      setTimerExpired(false);
      setTimerKey((k) => k + 1); // server restarts timer for same round after a void
    };

    const onRoundResult = (result) => {
      setRoundResult(result);
      setRoundVoid(null);
      setWaitingCount(null);
      setHistory((prev) => [...prev, result]);
      if (result.points) {
        setGameData((prev) => ({ ...prev, points: result.points }));
      }
    };

    const onPlayerEliminated = ({ socketId }) => {
      setEliminatedPlayers((prev) =>
        prev.includes(socketId) ? prev : [...prev, socketId]
      );
    };

    const onGameOver        = (data)          => setGameOver(data);
    const onTimerExpired    = ()              => setTimerExpired(true);

    const onGameReset = () => {
      setRoundResult(null);
      setRoundVoid(null);
      setSubmitted(false);
      setSelectedNumber(null);
      setGameOver(null);
      setEliminatedPlayers([]);
      setWaitingCount(null);
      setAlert(null);
      setHistory([]);
      setTimerExpired(false);
    };

    const onInvalidNumber = ({ message }) => {
      setAlert({ type: "error", message });
      setSubmitted(false);
      setSelectedNumber(null);
    };

    const onDuplicateSubmission = ({ message }) => {
      setAlert({ type: "error", message });
    };

    const onRoundAlreadyCompleted = () => {
      setAlert({ type: "error", message: "Round already completed — wait for next round." });
    };

    socket.on("next_round",              onNextRound);
    socket.on("waiting_for_players",     onWaitingForPlayers);
    socket.on("round_void",              onRoundVoid);
    socket.on("round_result",            onRoundResult);
    socket.on("player_eliminated",       onPlayerEliminated);
    socket.on("game_over",               onGameOver);
    socket.on("game_reset",              onGameReset);
    socket.on("invalid_number",          onInvalidNumber);
    socket.on("duplicate_submission",    onDuplicateSubmission);
    socket.on("round_already_completed", onRoundAlreadyCompleted);
    socket.on("timer_expired",           onTimerExpired);

    return () => {
      socket.off("next_round",              onNextRound);
      socket.off("waiting_for_players",     onWaitingForPlayers);
      socket.off("round_void",              onRoundVoid);
      socket.off("round_result",            onRoundResult);
      socket.off("player_eliminated",       onPlayerEliminated);
      socket.off("game_over",               onGameOver);
      socket.off("game_reset",              onGameReset);
      socket.off("invalid_number",          onInvalidNumber);
      socket.off("duplicate_submission",    onDuplicateSubmission);
      socket.off("round_already_completed", onRoundAlreadyCompleted);
      socket.off("timer_expired",           onTimerExpired);
    };
  }, []);

  const providerValue = useMemo(
    () => ({
      gameData,
      roundResult,
      roundVoid,
      submitted,
      setSubmitted,
      selectedNumber,
      setSelectedNumber,
      waitingCount,
      gameOver,
      eliminatedPlayers,
      alert,
      setAlert,
      history,
      hostSocketId,
      timerExpired,
      timerKey,
    }),
    [
      gameData, roundResult, roundVoid, submitted, selectedNumber,
      waitingCount, gameOver, eliminatedPlayers, alert, history,
      hostSocketId, timerExpired, timerKey,
    ]
  );

  return (
    <NumwitRuleContext.Provider value={providerValue}>
      {children}
    </NumwitRuleContext.Provider>
  );
};

NumwitRuleProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useNumwit = () => useContext(NumwitRuleContext);
