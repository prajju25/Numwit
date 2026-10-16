import React, { useState, useEffect } from "react";
import { twMerge } from "tailwind-merge";
import { useGame } from "../contexts/GameContext";
import { useUser } from "../contexts/UserContext";
import { useNumwit } from "../contexts/NumwitRuleContext";
import socket from "../socket";
import useIsDesktop from "../hooks/useIsDesktop";
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
import GameChat from "./GameChat";
import { track, trackView } from "../services/analytics";
import { BOT_DIFFICULTIES } from "../constants/constants";

function GameBoard() {
  const { roomId, user } = useUser();
  const { players } = useGame();
  const {
    gameData, roundResult, roundVoid, submitted, setSubmitted,
    selectedNumber, setSelectedNumber, waitingCount, gameOver,
    eliminatedPlayers, alert, setAlert, timerExpired, timerKey, history,
  } = useNumwit();
  const isDesktop = useIsDesktop();

  const [showOverlay, setShowOverlay] = useState(false);
  const [tipDismissed, setTipDismissed] = useState({});
  const handleTipDismiss = (round) => setTipDismissed((d) => ({ ...d, [round]: true }));
  const timerRef = React.useRef(null);

  useEffect(() => {
    if (roundResult || roundVoid) setShowOverlay(true);
  }, [roundResult, roundVoid]);

  // Analytics screen: playing vs the game-over results (and back on "Play again")
  useEffect(() => {
    if (gameOver) trackView("/play/results", "Results");
    else trackView("/play/game", "Game");
  }, [!!gameOver]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timerKey && timerRef.current) {
      timerRef.current.scrollIntoView?.({ behavior: "smooth", block: "start" });
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
    if (gameData.round === 1) track("first_pick");
  };

  const isEliminated = eliminatedPlayers?.includes(mySocketId);
  const activePlayers = (players || []).filter((p) => !(eliminatedPlayers || []).includes(p.socketId));
  const isDuel = activePlayers.length === 2;
  const pct = (gameData.targetMultiplier * 100 || 80).toFixed(0);
  // Which computer opponents you face (only shown when bots are in the game)
  const hasBots = (players || []).some((p) => p.isBot);
  const botLevel = hasBots
    ? BOT_DIFFICULTIES.find((d) => d.id === gameData.gameSettings?.botDifficulty)
    : null;

  // Last round's target — shown as a marker on the slider / a zone on the grid.
  const lastRound = history?.length ? history[history.length - 1] : null;
  const lastTarget = typeof lastRound?.target === "number" ? lastRound.target : undefined;

  // Who has locked in this round (ids only — picks stay secret until reveal).
  const lockedIds = [
    ...(waitingCount?.submittedIds || []),
    ...(submitted && !waitingCount?.submittedIds?.includes(mySocketId) ? [mySocketId] : []),
  ];

  const numberInput = isPendingJoiner ? (
    <div className="flex-1 flex flex-col items-center justify-center py-10 gap-3">
      <span className="text-5xl">⏳</span>
      <p className="text-[#A3A8C7] text-sm text-center m-0">You&apos;ll join from the next round.</p>
      <p className="text-[#6E749A] text-xs m-0">Watch the current round finish…</p>
    </div>
  ) : isEliminated ? (
    <div className="flex-1 flex flex-col items-center justify-center py-10 gap-3">
      <span className="text-5xl">💀</span>
      <p className="text-[#A3A8C7] text-sm m-0 text-center">You were eliminated. Watch the game continue…</p>
    </div>
  ) : (
    <NumberInput
      onSelect={handleNumberClick}
      disabled={submitted || timerExpired}
      selectedNumber={selectedNumber}
      lastTarget={lastTarget}
    />
  );

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[22px] sm:text-[26px] font-bold m-0">
            {isDuel ? "⚔️ Duel — " : ""}Round{" "}
            <span className="nums text-violet-300">{gameData.round != null ? gameData.round : "—"}</span>
          </h2>
          <span className="nums px-2 py-0.5 rounded-full text-[11px] font-bold text-cyan-300 bg-cyan-400/10 border border-cyan-400/35">
            ×{(pct / 100).toFixed(1)}
          </span>
          {botLevel && (
            <span
              title={`Bots: ${botLevel.label} — ${botLevel.blurb}`}
              className="px-2 py-0.5 rounded-full text-[11px] font-bold text-violet-200 bg-violet-500/10 border border-violet-400/35 whitespace-nowrap"
            >
              {botLevel.icon} {botLevel.label}
            </span>
          )}
        </div>
        <p className="text-xs text-[#8F95B8] mt-0.5 mb-0">
          Pick a number closest to {pct}% of the average
        </p>
      </div>
      <div className="text-right shrink-0 pt-1">
        {isPendingJoiner ? (
          <span className="text-sm font-bold text-white/40 animate-pulse">Joining next round…</span>
        ) : isEliminated ? (
          <span className="text-sm font-bold text-red-300">Eliminated</span>
        ) : submitted ? (
          <div className="text-sm font-medium">
            <span className="text-[#8F95B8]">Submitted: </span>
            <span className="nums font-extrabold text-emerald-300 text-lg">{selectedNumber}</span>
          </div>
        ) : timerExpired ? (
          <span className="text-sm font-bold text-red-300">Time&apos;s up!</span>
        ) : (
          <span className="text-sm text-[#8F95B8]">Pick your number</span>
        )}
      </div>
    </div>
  );

  // Avatars that tick green as players lock in.
  const lockTracker = !isDuel && activePlayers.length > 0 && (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl bg-black/20 border border-white/[0.07]">
      <div className="flex">
        {activePlayers.map((p) => {
          const locked = lockedIds.includes(p.socketId);
          return (
            <span
              key={p.socketId}
              title={`${p.name}${locked ? " — locked in" : ""}`}
              className={twMerge(
                "relative -mr-1.5 w-8 h-8 rounded-full bg-[#1A1E38] border-2 flex items-center justify-center text-[15px] transition-colors duration-300",
                locked ? "nw-ring-pop border-emerald-500" : "border-white/20"
              )}
            >
              {p.avatar}
              {locked && (
                <span className="nw-pop absolute -right-1 -bottom-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#0B0E1C] flex items-center justify-center" aria-hidden="true">
                  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
                </span>
              )}
            </span>
          );
        })}
      </div>
      {waitingCount ? (
        <span className="text-[13px] text-[#A3A8C7]">
          <span className="nums font-extrabold text-emerald-300">{waitingCount.submitted}/{waitingCount.total}</span> submitted
        </span>
      ) : (
        <span className="text-[13px] text-[#8F95B8]">{activePlayers.length} players</span>
      )}
    </div>
  );

  const pickArea = isDuel ? (
    <DuelView players={players} points={gameData.points} eliminatedPlayers={eliminatedPlayers} mySocketId={mySocketId}>
      {numberInput}
    </DuelView>
  ) : (
    numberInput
  );

  const footerRule = (
    <p className="text-center text-[10px] text-[#6E749A] border-t border-white/[0.07] pt-3 m-0">
      Target = {pct}% of average · Unique picks (3+ players) · Ties = all win · {gameData.eliminationThreshold || 5} pts = eliminated
    </p>
  );

  const scores = !isDuel && (
    <div className="glass-card rounded-[18px] p-4">
      <PlayerScorePanel
        players={players}
        points={gameData.points}
        eliminatedPlayers={eliminatedPlayers}
        lockedIds={lockedIds}
        mySocketId={mySocketId}
      />
    </div>
  );

  const overlays = (
    <>
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
    </>
  );

  // Countdown timer — paused while the round-result overlay is showing,
  // so it doesn't keep ticking down (or hit 0) during the post-round pause
  const timer = (
    <CountdownTimer key={timerKey} timerDuration={gameData.timerDuration} paused={!!(roundResult || roundVoid)} />
  );

  if (isDesktop) {
    return (
      <div ref={timerRef} className="w-full grid grid-cols-[250px_minmax(0,1fr)_300px] xl:grid-cols-[270px_minmax(0,1fr)_320px] gap-5 items-start animate-fadeIn scroll-mt-20">
        {overlays}

        <aside className="flex flex-col gap-3.5 min-w-0">
          {scores}
          <VoicePanel />
        </aside>

        <main className="glass-card rounded-3xl p-5 xl:p-6 flex flex-col gap-4 min-w-0">
          {header}
          <TutorialOverlay dismissed={tipDismissed} onDismiss={handleTipDismiss} />
          {lockTracker}
          {timer}
          {pickArea}
          {footerRule}
        </main>

        <aside className="flex flex-col gap-3.5 min-w-0">
          <RoundHistory />
          <GameChat variant="panel" />
          <EmoteBar />
        </aside>
      </div>
    );
  }

  return (
    <div ref={timerRef} className="w-full max-w-md mx-auto flex flex-col gap-3.5 animate-fadeIn scroll-mt-20">
      {overlays}

      <main className="glass-card rounded-3xl p-4 flex flex-col gap-4">
        {header}
        {lockTracker}
        {timer}
        {pickArea}
      </main>

      {/* Strategy tip below the pick area so it doesn't push the timer down */}
      <TutorialOverlay dismissed={tipDismissed} onDismiss={handleTipDismiss} />

      {scores}
      <RoundHistory />
      <VoicePanel />
      {footerRule}

      {/* Dock: reactions + chat, pinned to the bottom of the screen */}
      <div
        className="sticky bottom-0 -mx-4 px-4 pt-3 pb-3 flex items-center gap-2 z-30"
        style={{ background: "linear-gradient(180deg, rgba(11,14,28,0), rgba(11,14,28,.94) 30%)", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex-1 min-w-0"><EmoteBar /></div>
        <GameChat variant="dock" />
      </div>
    </div>
  );
}

export default GameBoard;
