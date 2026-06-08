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
 * @param {number|null} timerDuration  - seconds (from next_round payload), or null
 * @returns {{ timeLeft: number, isExpired: boolean }}
 */
export default function useCountdown(timerDuration) {
  const [timeLeft, setTimeLeft] = useState(timerDuration || 0);
  const [isExpired, setIsExpired] = useState(false);
  const intervalRef = useRef(null);
  const startedAtRef = useRef(null);
  const durationRef = useRef(timerDuration);

  // Reset and restart whenever timerDuration changes (new round)
  useEffect(() => {
    if (!timerDuration) {
      setTimeLeft(0);
      setIsExpired(false);
      return;
    }

    durationRef.current = timerDuration;
    startedAtRef.current = Date.now();
    setTimeLeft(timerDuration);
    setIsExpired(false);

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      const remaining = Math.max(0, Math.ceil(durationRef.current - elapsed));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(intervalRef.current);
        setIsExpired(true);
      }
    }, 250);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerDuration]);

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
