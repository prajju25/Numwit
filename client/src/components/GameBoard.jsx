import React, { useState, useEffect } from "react";
import { useGame } from "../contexts/GameContext";
import { useUser } from "../contexts/UserContext";
import { useNumwit } from "../contexts/NumwitRuleContext";
import socket from "../socket";
import NumberInput from "./NumberInput";
import PlayerScorePanel from "./PlayerScorePanel";
import RoundResultOverlay from "./RoundResultOverlay";
import GameOverScreen from "./GameOverScreen";
import CountdownTimer from "./CountdownTimer";
import RoundHistory from "./RoundHistory";
import EmoteBar from "./EmoteBar";
import DuelView from "./DuelView";
import TutorialOverlay from "./TutorialOverlay";
import FloatingAlert from "../modals/FloatingAlert";
import VoicePanel from "./VoicePanel";

function GameBoard() {
  const { roomId, user } = useUser();
  const { players } = useGame();
  const {
    gameData, roundResult, roundVoid, submitted, setSubmitted,
    selectedNumber, setSelectedNumber, waitingCount, gameOver,
    eliminatedPlayers, alert, setAlert, timerExpired, timerKey,
  } = useNumwit();

  const [showOverlay, setShowOverlay] = useState(false);
  const [tipDismissed, setTipDismissed] = useState({});
  const handleTipDismiss = (round) => setTipDismissed((d) => ({ ...d, [round]: true }));
  const timerRef = React.useRef(null);

  useEffect(() => {
    if (roundResult || roundVoid) setShowOverlay(true);
  }, [roundResult, roundVoid]);

  useEffect(() => {
    if (timerKey && timerRef.current) {
      timerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [timerKey]);

  if (gameOver) return <GameOverScreen data={gameOver} players={players} />;

  const mySocketId = user?.socketId ?? socket.id;

  // A player who joined while a game was already running is queued as a
  // pendingJoiner. Their socketId won't appear in gameData.turnOrder until
  // the next round begins. Show a waiting message until then.
  const isPendingJoiner = gameData.turnOrder && !gameData.turnOrder.includes(mySocketId);

  const handleNumberClick = (no) => {
    if (submitted) return;
    setSubmitted(true);
    setSelectedNumber(no);
    socket.emit("send_number", { roomId, user, no });
  };

  const isEliminated = eliminatedPlayers?.includes(mySocketId);
  const activePlayers = (players || []).filter((p) => !(eliminatedPlayers || []).includes(p.socketId));
  const isDuel = activePlayers.length === 2;

  const numberInput = isPendingJoiner ? (
    <div className="flex-1 flex flex-col items-center justify-center py-10 gap-3">
      <span className="text-5xl">⏳</span>
      <p className="text-white/40 text-sm text-center">You&apos;ll join from the next round.</p>
      <p className="text-white/25 text-xs">Watch the current round finish…</p>
    </div>
  ) : isEliminated ? (
    <div className="flex-1 flex flex-col items-center justify-center py-10 gap-3">
      <span className="text-5xl">💀</span>
      <p className="text-white/40 text-sm">You were eliminated. Watch the game continue…</p>
    </div>
  ) : (
    <NumberInput
      onSelect={handleNumberClick}
      disabled={submitted || timerExpired}
      selectedNumber={selectedNumber}
    />
  );

  return (
    <div ref={timerRef} className="w-full max-w-2xl space-y-4 animate-fadeIn scroll-mt-16">
      {alert && <FloatingAlert message={alert.message} onClose={() => setAlert(null)} />}

      {showOverlay && (roundResult || roundVoid) && (
        <RoundResultOverlay
          result={roundVoid ? null : roundResult}
          voidData={roundVoid || null}
          players={players}
          onDismiss={() => setShowOverlay(false)}
          roomId={roomId}
        />
      )}

      {/* Main game card */}
      <div className="glass-card p-5 sm:p-6 space-y-5">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-white">
              {isDuel ? "⚔️ Duel — " : ""}Round{" "}
              <span className="text-violet-400">{gameData.round != null ? gameData.round : "—"}</span>
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              Pick a number closest to {(gameData.targetMultiplier * 100 || 80).toFixed(0)}% of the average
            </p>
          </div>
          <div className="text-right">
            {isPendingJoiner ? (
              <span className="text-sm font-bold text-white/30 animate-pulse">Joining next round…</span>
            ) : isEliminated ? (
              <span className="text-sm font-bold text-red-400">Eliminated</span>
            ) : submitted ? (
              <div className="text-sm font-medium animate-pulse">
                <span className="text-white/50">Submitted: </span>
                <span className="font-extrabold text-violet-400 text-lg font-mono">{selectedNumber}</span>
              </div>
            ) : timerExpired ? (
              <span className="text-sm font-bold text-red-400">Time&apos;s up!</span>
            ) : (
              <span className="text-sm text-white/40">Pick your number</span>
            )}
          </div>
        </div>

        {/* Strategy tip — desktop only here (between header and timer).
            On mobile it renders below scores to avoid pushing the timer/grid down. */}
        <div className="hidden sm:block">
          <TutorialOverlay dismissed={tipDismissed} onDismiss={handleTipDismiss} />
        </div>

        {/* Countdown timer — paused while the round-result overlay is showing,
            so it doesn't keep ticking down (or hit 0) during the post-round pause */}
        <CountdownTimer key={timerKey} timerDuration={gameData.timerDuration} paused={!!(roundResult || roundVoid)} />

        {/* Main area */}
        {isDuel ? (
          <DuelView players={players} points={gameData.points} eliminatedPlayers={eliminatedPlayers} mySocketId={mySocketId}>
            {numberInput}
          </DuelView>
        ) : (
          <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
            {/* Scores — below number pick on mobile, left column on desktop */}
            <div className="order-2 sm:order-1 sm:shrink-0 w-full sm:w-auto">
              <PlayerScorePanel players={players} points={gameData.points} eliminatedPlayers={eliminatedPlayers} />
            </div>
            {/* Vertical divider — desktop only */}
            <div className="hidden sm:block sm:order-2 w-px bg-white/10 self-stretch" />
            {/* Number pick + waiting indicator — top on mobile, right column on desktop */}
            <div className="order-1 sm:order-3 w-full flex flex-col gap-3">
              {numberInput}
              {waitingCount && (
                <div className="w-full flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-cyan-300 border border-cyan-500/25"
                  style={{ background: "rgba(6,182,212,0.08)" }}>
                  <span className="animate-spin text-base">⏳</span>
                  Waiting — <span className="font-bold">{waitingCount.submitted}/{waitingCount.total}</span> submitted
                </div>
              )}
            </div>
          </div>
        )}

        {/* Strategy tip — mobile only, below scores so it doesn't disrupt the pick area */}
        <div className="sm:hidden">
          <TutorialOverlay dismissed={tipDismissed} onDismiss={handleTipDismiss} />
        </div>

        {/* Round history */}
        <RoundHistory />

        {/* Voice Chat */}
        <VoicePanel />

        {/* Emote bar */}
        <EmoteBar />

        {/* Footer rule */}
        <p className="text-center text-[10px] text-white/25 border-t border-white/10 pt-3">
          Target = {(gameData.targetMultiplier * 100 || 80).toFixed(0)}% of average · Unique picks (3+ players) · Ties = all win · {gameData.eliminationThreshold || 5} pts = eliminated
        </p>
      </div>
    </div>
  );
}

export default GameBoard;
