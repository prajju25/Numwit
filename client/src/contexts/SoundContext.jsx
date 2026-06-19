import PropTypes from "prop-types";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import socket from "../socket";
import soundManager from "../services/soundManager";

const STORAGE_KEY = "80p-sound-muted";

const SoundContext = createContext();

export const SoundProvider = ({ children }) => {
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch (_) { return false; }
  });

  useEffect(() => {
    soundManager.setMuted(muted);
    try {
      localStorage.setItem(STORAGE_KEY, String(muted));
    } catch (err) {
      // Storage full or unavailable (e.g. private browsing) — the mute
      // preference just won't persist across reloads; not user-facing.
      console.warn("Failed to persist sound preference:", err.message);
    }
  }, [muted]);

  useEffect(() => {
    const onNextRound        = ()       => soundManager.playRoundStart();
    const onNumberReceived   = ()       => soundManager.playSubmit();
    const onRoundResult      = (result) => {
      if (result?.exactMatch) soundManager.playExactMatch();
    };
    const onPlayerEliminated = ()       => soundManager.playElimination();
    const onGameOver         = ()       => soundManager.playWin();

    socket.on("next_round",        onNextRound);
    socket.on("number_received",   onNumberReceived);
    socket.on("round_result",      onRoundResult);
    socket.on("player_eliminated", onPlayerEliminated);
    socket.on("game_over",         onGameOver);

    return () => {
      socket.off("next_round",        onNextRound);
      socket.off("number_received",   onNumberReceived);
      socket.off("round_result",      onRoundResult);
      socket.off("player_eliminated", onPlayerEliminated);
      socket.off("game_over",         onGameOver);
    };
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const providerValue = useMemo(() => ({ muted, toggleMute }), [muted, toggleMute]);

  return <SoundContext.Provider value={providerValue}>{children}</SoundContext.Provider>;
};

SoundProvider.propTypes = { children: PropTypes.node.isRequired };

export const useSound = () => useContext(SoundContext);
