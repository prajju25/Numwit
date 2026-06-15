import { useEffect, useRef, useState } from "react";
import socket from "../socket";

const DRIFT_CORRECTION_THRESHOLD = 1; // seconds — correct if drift exceeds this

/**
 * useCountdown
 * ─────────────────────────────────────────────────────────────────────────────
 * Starts a client-side countdown whenever `timerDuration` changes (non-null).
 *
 * Drift correction:
 *   - Listens for `timer_tick` (emitted every 10s by the server).
 *   - If client countdown differs from server by >1s, snaps to server value.
 *
 * Force expiry:
 *   - `timer_expired` from the server immediately sets timeLeft=0.
 *
 * Pause:
 *   - While `paused` is true, the displayed value is frozen (no ticking).
 *     Used to freeze the pick-timer while the round-result overlay is shown
 *     during the post-round pause, then resume from where it left off.
 *
 * @param {number|null} timerDuration  - seconds (from next_round payload), or null
 * @param {boolean} [paused]           - freeze the countdown while true
 * @returns {{ timeLeft: number, isExpired: boolean }}
 */
export default function useCountdown(timerDuration, paused = false) {
  const [timeLeft, setTimeLeft] = useState(timerDuration || 0);
  const [isExpired, setIsExpired] = useState(false);
  const intervalRef = useRef(null);
  const startedAtRef = useRef(null);
  const durationRef = useRef(timerDuration);
  const timeLeftRef = useRef(timeLeft);

  timeLeftRef.current = timeLeft;

  const clearTick = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startTick = () => {
    clearTick();
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      const remaining = Math.max(0, Math.ceil(durationRef.current - elapsed));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearTick();
        setIsExpired(true);
      }
    }, 250);
  };

  // Reset and restart whenever timerDuration changes (new round)
  useEffect(() => {
    if (!timerDuration) {
      setTimeLeft(0);
      setIsExpired(false);
      clearTick();
      return;
    }

    durationRef.current = timerDuration;
    startedAtRef.current = Date.now();
    setTimeLeft(timerDuration);
    setIsExpired(false);

    if (!paused) startTick();

    return clearTick;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerDuration]);

  // Pause/resume — freeze the displayed value while paused (e.g. while the
  // round-result overlay is showing), and resume counting down from where it
  // left off when unpaused. Only reacts to changes in `paused` (not the
  // initial mount, which the reset effect above already handles, and not
  // `timerDuration` changes, which would clobber startedAtRef with a stale
  // timeLeftRef before the reset effect's state update is visible).
  const isFirstPauseEffect = useRef(true);
  useEffect(() => {
    if (isFirstPauseEffect.current) {
      isFirstPauseEffect.current = false;
      return;
    }

    if (!timerDuration || isExpired) return;

    if (paused) {
      clearTick();
      return;
    }

    // Resuming: re-anchor startedAtRef so `elapsed` reflects only active time.
    startedAtRef.current = Date.now() - (durationRef.current - timeLeftRef.current) * 1000;
    startTick();

    return clearTick;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // Server tick: correct drift if off by more than threshold
  useEffect(() => {
    if (!socket) return;

    const onTick = ({ secondsLeft }) => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      const clientEstimate = Math.max(0, Math.ceil(durationRef.current - elapsed));
      const drift = Math.abs(clientEstimate - secondsLeft);
      if (drift > DRIFT_CORRECTION_THRESHOLD) {
        // Resync: treat secondsLeft as remaining from now
        durationRef.current = secondsLeft;
        startedAtRef.current = Date.now();
        setTimeLeft(secondsLeft);
      }
    };

    socket.on("timer_tick", onTick);
    return () => socket.off("timer_tick", onTick);
  }, []);

  // Server-authoritative expiry
  useEffect(() => {
    if (!socket) return;

    const onExpired = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setTimeLeft(0);
      setIsExpired(true);
    };

    socket.on("timer_expired", onExpired);
    return () => socket.off("timer_expired", onExpired);
  }, []);

  return { timeLeft, isExpired };
}
