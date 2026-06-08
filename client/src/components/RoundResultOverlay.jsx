import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

// Steps auto-advance every 1200ms (3 transitions = 3600ms total).
// The overlay closes automatically when next_round arrives (~5s after round_result)
// which clears roundResult in NumwitRuleContext, making the parent's render condition false.
const STEP_DELAY  = 1200;
const AUTO_DISMISS = 6000; // fallback — only fires if next_round is delayed

export default function RoundResultOverlay({ result, voidData, players, onDismiss }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => { setStep(0); setVisible(true); }, [result, voidData]);

  // Void: auto-dismiss after 4s
  useEffect(() => {
    if (!voidData || !visible) return;
    const t = setTimeout(() => { setVisible(false); onDismiss?.(); }, 4000);
    return () => clearTimeout(t);
  }, [voidData, visible]);

  // Normal: step auto-advance
  const totalSteps = 4;
  useEffect(() => {
    if (!result || voidData || !visible) return;
    if (step < totalSteps - 1) {
      const t = setTimeout(() => setStep((s) => s + 1), STEP_DELAY);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => { setVisible(false); onDismiss?.(); }, AUTO_DISMISS);
      return () => clearTimeout(t);
    }
  }, [step, result, voidData, visible]);

  if (!visible) return null;

  const dismiss = () => { setVisible(false); onDismiss?.(); };
  const advance = () => { if (step < totalSteps - 1) setStep((s) => s + 1); else dismiss(); };

  // ── Void round ──────────────────────────────────────────────────────────────
  if (voidData) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
        onClick={dismiss}>
        <div className="glass-card w-full max-w-sm mx-4 p-7 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="text-5xl">🔄</div>
          <h2 className="text-xl font-extrabold text-white">Round Void!</h2>
          <p className="text-sm text-white/55">{voidData.reason}</p>

          {voidData.submissions?.length > 0 && (
            <div className="text-left rounded-xl overflow-hidden border border-white/10">
              <div className="px-4 py-2 label-muted border-b border-white/10" style={{ background: "rgba(255,255,255,0.05)" }}>
                What everyone picked
              </div>
              {voidData.submissions.map((s) => {
                const player = players?.find((p) => p.socketId === s.socketId);
                return (
                  <div key={s.socketId} className="flex justify-between items-center px-4 py-2.5 border-t border-white/5 text-sm">
                    <span className="text-white/70">{player ? `${player.avatar} ${player.name}` : s.socketId}</span>
                    <span className="font-mono font-bold text-white">{s.number}</span>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-cyan-400 font-semibold animate-pulse">
            No points awarded. Round replaying…
          </p>
          <button onClick={dismiss} className="text-xs text-white/30 hover:text-white/60 transition">
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const winnerIds   = result.winnerIds || (result.winnerSocketId ? [result.winnerSocketId] : []);
  const winners     = players?.filter((p) => winnerIds.includes(p.socketId)) || [];
  const isMultiWin  = winnerIds.length > 1;
  const stepLabels  = ["Stats", "Winner", "Picks", "Result"];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
      onClick={advance}>
      <div className="glass-card w-full max-w-sm mx-4 p-6 space-y-4 text-center"
        onClick={(e) => e.stopPropagation()}>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className={`w-2 h-2 rounded-full transition-all duration-300 ${i <= step ? "bg-violet-500 scale-125" : "bg-white/15"}`} />
            </div>
          ))}
          <span className="text-xs text-white/40 ml-1">{stepLabels[step]}</span>
        </div>

        {/* Round badge */}
        <span className="inline-block bg-violet-500/20 text-violet-400 border border-violet-500/30 text-xs font-bold px-3 py-1 rounded-full">
          Round {result.round} Result
        </span>

        {/* Step 0: Stats */}
        {step >= 0 && (
          <div className="flex justify-around text-sm animate-fadeIn">
            <div>
              <p className="label-muted mb-1">Average</p>
              <p className="text-3xl font-extrabold text-white font-mono">
                {result.average != null ? result.average.toFixed(2) : "—"}
              </p>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <p className="label-muted mb-1">Target</p>
              <p className="text-3xl font-extrabold text-violet-400 font-mono">
                {result.target != null ? result.target.toFixed(2) : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Step 1: Winner */}
        {step >= 1 && (
          <div className="rounded-xl py-4 px-4 animate-fadeIn space-y-2 border border-emerald-500/30"
            style={{ background: "rgba(16,185,129,0.1)" }}>
            {result.exactMatch && (
              <div className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-300"
                style={{ background: "rgba(245,158,11,0.1)" }}>
                ⚡ Exact match! Opponents get <strong>+2 pts</strong>
              </div>
            )}
            {result.twoPlayerCycle && (
              <div className="text-xs px-3 py-1.5 rounded-lg border border-orange-500/30 text-orange-300"
                style={{ background: "rgba(234,88,12,0.1)" }}>
                ⚔️ 2-player special rule applied
              </div>
            )}
            {isMultiWin && (
              <div className="text-xs px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-300"
                style={{ background: "rgba(6,182,212,0.1)" }}>
                🤝 Tie — multiple winners!
              </div>
            )}
            <p className="text-xs text-emerald-400 uppercase font-bold tracking-widest">
              {isMultiWin ? "🏆 Winners" : "🏆 Winner"}
            </p>
            {winners.length > 0 ? winners.map((w) => (
              <p key={w.socketId} className="text-2xl font-extrabold text-white">
                {w.avatar} {w.name}
              </p>
            )) : (
              <p className="text-2xl font-extrabold text-white">—</p>
            )}
          </div>
        )}

        {/* Step 2: Submissions */}
        {step >= 2 && (
          <div className="text-left rounded-xl overflow-hidden border border-white/10 animate-fadeIn">
            <div className="px-3 py-2 label-muted border-b border-white/10" style={{ background: "rgba(255,255,255,0.05)" }}>
              Submissions
            </div>
            {result.submissions?.map((s) => {
              const player    = players?.find((p) => p.socketId === s.socketId);
              const isWinner  = winnerIds.includes(s.socketId);
              const isInvalid = result.invalidSubmissions?.some((inv) => inv.socketId === s.socketId);
              return (
                <div key={s.socketId}
                  className={`flex justify-between items-center px-3 py-2.5 border-t border-white/5 text-sm ${isWinner ? "bg-emerald-500/10" : isInvalid ? "bg-red-500/10" : ""}`}>
                  <span className="flex items-center gap-1 text-white/70">
                    {player ? `${player.avatar} ${player.name}` : s.socketId}
                    {isWinner  && <span className="text-xs ml-1">🏆</span>}
                    {isInvalid && <span className="text-xs ml-1 text-red-400">(duplicate)</span>}
                  </span>
                  <span className={`font-mono font-bold ${isInvalid ? "text-red-400 line-through" : isWinner ? "text-emerald-400" : "text-white"}`}>
                    {s.number}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Step 3: Eliminations */}
        {step >= 3 && (
          <div className="animate-fadeIn">
            {result.newlyEliminated?.length > 0 ? (
              <div className="rounded-xl px-4 py-3 text-sm text-red-300 border border-red-500/30"
                style={{ background: "rgba(239,68,68,0.1)" }}>
                ☠️ Eliminated:{" "}
                {result.newlyEliminated.map((id) => {
                  const p = players?.find((pl) => pl.socketId === id);
                  return p ? `${p.avatar} ${p.name}` : id;
                }).join(", ")}
              </div>
            ) : (
              <p className="text-xs text-white/30">No eliminations this round.</p>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between text-xs pt-1">
          <button onClick={dismiss} className="text-white/30 hover:text-white/60 transition">
            Skip
          </button>
          <button onClick={advance}
            className="px-4 py-1.5 rounded-lg bg-violet-600/30 text-violet-300 border border-violet-500/30 font-semibold hover:bg-violet-600/50 transition">
            {step < totalSteps - 1 ? "Next →" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

RoundResultOverlay.propTypes = {
  result: PropTypes.object,
  voidData: PropTypes.object,
  players: PropTypes.array,
  onDismiss: PropTypes.func,
};
