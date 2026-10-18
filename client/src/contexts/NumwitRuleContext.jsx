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
  // Post-game rewards: xp_update and achievement_unlocked arrive just after
  // game_over and are shown on GameOverScreen.
  const [xpData,            setXpData]            = useState(null);
  const [newAchievements,   setNewAchievements]   = useState([]);

  // A snapshot of the running game arrives when the user joins mid-game —
  // either before this provider mounts (joining from the home screen) or while
  // it is already showing the board (the connection dropped and came back:
  // the player has a new socket id, so the old turn order no longer lists
  // them). Apply it whenever it arrives.
  useEffect(() => {
    if (!spectatorSnapshot) return;
    setGameData(spectatorSnapshot);
    if (spectatorSnapshot.eliminatedPlayers) setEliminatedPlayers(spectatorSnapshot.eliminatedPlayers);
    if (spectatorSnapshot.hostSocketId)      setHostSocketId(spectatorSnapshot.hostSocketId);
    if (spectatorSnapshot.resumed) {
      // Back in the same game: show this round as the server has it — our
      // own pick if it got through (if not, we can pick again), and who else
      // has picked.
      const mine = spectatorSnapshot.myNumber;
      const hasPick = mine !== null && mine !== undefined;
      setSubmitted(hasPick);
      setSelectedNumber(hasPick ? mine : null);
      const ids = spectatorSnapshot.submittedIds || [];
      const eliminated = spectatorSnapshot.eliminatedPlayers || [];
      const total = (spectatorSnapshot.turnOrder || []).filter((id) => !eliminated.includes(id)).length;
      setWaitingCount(ids.length ? { submitted: ids.length, total, submittedIds: ids } : null);
    }
    if (spectatorSnapshot.timerDuration > 0) setTimerExpired(false);
    setTimerKey((k) => k + 1);
    clearSpectatorSnapshot();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spectatorSnapshot]);

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

    const onWaitingForPlayers = ({ submitted: s, total, submittedIds }) => {
      setWaitingCount({ submitted: s, total, submittedIds: submittedIds || [] });
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
    const onXpUpdate        = (data)          => setXpData(data);
    const onAchievement     = (ach)           => setNewAchievements((prev) =>
      prev.some((a) => a.id === ach.id) ? prev : [...prev, ach]
    );
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
      setXpData(null);
      setNewAchievements([]);
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
    socket.on("room_deleted",            onGameReset); // clear gameOver when room is auto-deleted
    socket.on("invalid_number",          onInvalidNumber);
    socket.on("duplicate_submission",    onDuplicateSubmission);
    socket.on("round_already_completed", onRoundAlreadyCompleted);
    socket.on("timer_expired",           onTimerExpired);
    socket.on("xp_update",               onXpUpdate);
    socket.on("achievement_unlocked",    onAchievement);

    return () => {
      socket.off("next_round",              onNextRound);
      socket.off("waiting_for_players",     onWaitingForPlayers);
      socket.off("round_void",              onRoundVoid);
      socket.off("round_result",            onRoundResult);
      socket.off("player_eliminated",       onPlayerEliminated);
      socket.off("game_over",               onGameOver);
      socket.off("game_reset",              onGameReset);
      socket.off("room_deleted",            onGameReset);
      socket.off("invalid_number",          onInvalidNumber);
      socket.off("duplicate_submission",    onDuplicateSubmission);
      socket.off("round_already_completed", onRoundAlreadyCompleted);
      socket.off("timer_expired",           onTimerExpired);
      socket.off("xp_update",               onXpUpdate);
      socket.off("achievement_unlocked",    onAchievement);
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
      xpData,
      myLevel: xpData?.level ?? null,
      newAchievements,
    }),
    [
      gameData, roundResult, roundVoid, submitted, selectedNumber,
      waitingCount, gameOver, eliminatedPlayers, alert, history,
      hostSocketId, timerExpired, timerKey, xpData, newAchievements,
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
