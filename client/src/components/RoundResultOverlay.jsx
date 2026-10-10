import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { twMerge } from "tailwind-merge";
import socket from "../socket";
import { useUser } from "../contexts/UserContext";

// The server waits ROUND_RESULT_DELAY_MS (10s) after round_result before
// emitting next_round. The overlay shows the full result immediately and
// counts down that whole duration with "Next round starting in Xs…", then
// "Starting next round…". The overlay closes automatically when next_round
// arrives, which clears roundResult in NumwitRuleContext, making the
// parent's render condition false. AUTO_DISMISS is a fallback in case
// next_round is delayed.
const NEXT_ROUND_DELAY_MS = 10000; // mirrors server's ROUND_RESULT_DELAY_MS
const COUNTDOWN_SECONDS = Math.ceil(NEXT_ROUND_DELAY_MS / 1000); // 10
const AUTO_DISMISS = NEXT_ROUND_DELAY_MS + 1500; // fallback — only fires if next_round is delayed

// Reveal choreography (ms after the result arrives). Everything is in the DOM
// from the start; these phases only add CSS flags (p1…p5) that animate it in.
//   p1 pins drop · p2 average line + count-up · p3 target sweeps ×0.8
//   p4 winner crown/glow · p5 rows, penalty chips, eliminations
const PHASE_AT = [250, 1300, 2400, 3700, 4500];
const TWEEN_STEP_MS = 30;

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)")?.matches;
}

/** Stack pins that would overlap on the number line into up to 3 lanes. */
function layoutPins(submissions) {
  const sorted = [...(submissions || [])].sort((a, b) => a.number - b.number);
  const laneEnds = [];
  return sorted.map((s) => {
    let lane = laneEnds.findIndex((end) => s.number - end >= 7);
    if (lane === -1) lane = Math.min(laneEnds.length, 2);
    laneEnds[lane] = s.number;
    return { ...s, lane };
  });
}

export default function RoundResultOverlay({ result, voidData, players, onDismiss, roomId }) {
  const [visible, setVisible] = useState(true);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [phase, setPhase] = useState(0);
  const [avgShown, setAvgShown] = useState(0);
  const [tgtShown, setTgtShown] = useState(null);
  const tweenRef = useRef(null);
  const mySocketId = useUser()?.user?.socketId ?? socket.id;

  useEffect(() => { setVisible(true); setCountdown(COUNTDOWN_SECONDS); }, [result, voidData]);

  // Void: auto-dismiss after 5s
  useEffect(() => {
    if (!voidData || !visible) return;
    const t = setTimeout(() => { setVisible(false); onDismiss?.(); }, 5000);
    return () => clearTimeout(t);
  }, [voidData, visible]);

  // Result: fallback auto-dismiss in case next_round never arrives
  useEffect(() => {
    if (!result || voidData || !visible) return;
    const t = setTimeout(() => { setVisible(false); onDismiss?.(); }, AUTO_DISMISS);
    return () => clearTimeout(t);
  }, [result, voidData, visible]);

  // Tick the "next round starting in" countdown down to 0 — purely cosmetic,
  // the actual transition happens when next_round arrives.
  useEffect(() => {
    if (!result || voidData || !visible) return;
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, result, voidData, visible]);

  // Reveal sequence + number count-ups.
  useEffect(() => {
    if (!result || voidData) return undefined;
    const avg = result.average ?? 0;
    const tgt = result.target ?? avg;

    if (prefersReducedMotion()) {
      setPhase(5); setAvgShown(avg); setTgtShown(tgt);
      return undefined;
    }

    setPhase(0); setAvgShown(0); setTgtShown(avg);
    const tween = (setter, from, to, ms) => {
      clearInterval(tweenRef.current);
      const steps = Math.max(1, Math.round(ms / TWEEN_STEP_MS));
      let i = 0;
      tweenRef.current = setInterval(() => {
        i += 1;
        const t = 1 - Math.pow(1 - i / steps, 3); // ease-out cubic
        setter(from + (to - from) * t);
        if (i >= steps) clearInterval(tweenRef.current);
      }, TWEEN_STEP_MS);
    };

    const timers = PHASE_AT.map((ms, i) => setTimeout(() => {
      setPhase(i + 1);
      if (i === 1) tween(setAvgShown, 0, avg, 800);
      if (i === 2) tween(setTgtShown, avg, tgt, 1100);
    }, ms));

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(tweenRef.current);
    };
  }, [result, voidData]);

  if (!visible) return null;

  const dismiss = () => { setVisible(false); onDismiss?.(); };

  // Skip: for an actual round_result (not a void), tell the server to advance
  // to the next round immediately instead of waiting out the full
  // ROUND_RESULT_DELAY_MS countdown.
  const handleSkip = () => {
    if (result && !voidData) {
      socket.emit("skip_round_result", { roomId });
    }
    dismiss();
  };

  const findPlayer = (id) => players?.find((p) => p.socketId === id);

  // ── Void round ──────────────────────────────────────────────────────────────
  if (voidData) {
    return (
      <div className="fixed inset-0 bg-[#05060D]/75 backdrop-blur-sm flex items-center justify-center z-50 nw-fade"
        onClick={dismiss}>
        <div className="glass-card nw-rise w-full max-w-sm mx-4 p-7 text-center flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
          <div className="text-5xl">🔄</div>
          <h2 className="font-display text-2xl font-bold text-white m-0">Round Void!</h2>
          <p className="text-sm text-[#B4B9D6] m-0">{voidData.reason}</p>

          {voidData.submissions?.length > 0 && (
            <div className="text-left rounded-xl overflow-hidden border border-white/10">
              <div className="px-4 py-2 label-muted border-b border-white/10 bg-white/[0.04]">
                What everyone picked
              </div>
              {voidData.submissions.map((s, i) => {
                const player = findPlayer(s.socketId);
                return (
                  <div key={s.socketId} className="nw-rise flex justify-between items-center px-4 py-2.5 border-t border-white/5 text-sm" style={{ animationDelay: `${0.1 + i * 0.06}s` }}>
                    <span className="text-white/80">{player ? `${player.avatar} ${player.name}` : s.socketId}</span>
                    <span className="nums font-bold text-white">{s.number}</span>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-cyan-300 font-semibold animate-pulse m-0">
            No points awarded. Round replaying…
          </p>
          <button onClick={dismiss} className="text-xs text-white/40 hover:text-white/70 transition min-h-[44px]">
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
  const iWon        = winnerIds.includes(mySocketId);
  const avg         = result.average;
  const tgt         = result.target;
  const hasLine     = typeof avg === "number" && typeof tgt === "number";
  const multiplier  = hasLine && avg > 0 ? (tgt / avg).toFixed(1) : null;
  const invalidIds  = new Set((result.invalidSubmissions || []).map((s) => s.socketId));
  const eliminated  = new Set(result.newlyEliminated || []);
  const penalty     = result.exactMatch ? 2 : 1;
  const pins        = layoutPins(result.submissions);
  const flags       = ["p1", "p2", "p3", "p4", "p5"].slice(0, phase).join(" ");
  const clampPct    = (n) => Math.max(0, Math.min(100, n));

  const myDiff = (() => {
    const mine = result.submissions?.find((s) => s.socketId === mySocketId);
    return mine && hasLine ? Math.abs(mine.number - tgt) : null;
  })();

  // Rows sorted by distance to target; void picks sink to the bottom.
  const rows = [...(result.submissions || [])].sort((a, b) => {
    const ia = invalidIds.has(a.socketId), ib = invalidIds.has(b.socketId);
    if (ia !== ib) return ia ? 1 : -1;
    return hasLine ? Math.abs(a.number - tgt) - Math.abs(b.number - tgt) : 0;
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-[#05060D]/80 backdrop-blur-sm flex items-end sm:items-center justify-center nw-fade"
      onClick={handleSkip}
    >
      <div
        className={twMerge(
          flags,
          "relative w-full sm:max-w-md max-h-[100dvh] overflow-y-auto flex flex-col gap-3.5 px-4 pt-5 pb-5 sm:rounded-3xl sm:border sm:border-white/10"
        )}
        style={{ background: "radial-gradient(100% 40% at 50% 22%, rgba(34,211,238,.12), rgba(34,211,238,0) 70%), radial-gradient(120% 40% at 50% 0%, rgba(124,58,237,.25), rgba(124,58,237,0) 70%), #080A15" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nw-rv-flash pointer-events-none absolute inset-0 z-[1]" aria-hidden="true"
          style={{ background: "radial-gradient(60% 30% at 40% 30%, rgba(34,211,238,.28), rgba(34,211,238,0) 70%)" }} />

        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/40 text-xs font-bold text-violet-200">
            Round {result.round} Result
          </span>
          {hasLine && myDiff !== null && (
            <span className="nw-rv-late nums text-xs text-[#8F95B8]">you were off by {myDiff.toFixed(2)}</span>
          )}
        </div>

        {/* Winner banner */}
        <div className="nw-rv-banner text-center">
          <p className="text-xs text-amber-300 uppercase font-extrabold tracking-[0.16em] m-0">
            {isMultiWin ? "🏆 Winners" : "🏆 Winner"}
          </p>
          {winners.length > 0 ? winners.map((w) => (
            <p key={w.socketId} className="font-display text-[28px] font-bold text-white m-0 leading-tight">
              {w.avatar} {w.name}{w.socketId === mySocketId ? " (you)" : ""}
            </p>
          )) : (
            <p className="font-display text-[28px] font-bold text-white m-0">—</p>
          )}
          {iWon && <p className="text-sm text-amber-200 mt-1 mb-0">You read the room.</p>}
        </div>

        {/* Number line stage */}
        {hasLine && (
          <section className="glass-card rounded-[22px] px-3.5 pt-4 pb-3" aria-label={`Average ${avg.toFixed(2)}, target ${tgt.toFixed(2)}`}>
            <div className="relative h-[200px] mx-2" aria-hidden="true">
              <div className="nw-rv-avg absolute top-8 bottom-[34px] border-l-2 border-dashed border-white/80" style={{ left: `${clampPct(avg)}%` }}>
                <span className="nums absolute -top-6 left-1.5 whitespace-nowrap text-xs font-bold text-white">avg {avgShown.toFixed(1)}</span>
              </div>
              <div className="nw-rv-tgt absolute top-0 bottom-[34px] w-0" style={{ left: `${clampPct(phase >= 3 ? tgt : avg)}%` }}>
                <div className="absolute -left-[1.5px] top-[22px] bottom-0 w-[3px] rounded bg-cyan-400" style={{ boxShadow: "0 0 14px 3px rgba(34,211,238,.75)" }} />
                <span className="nums absolute top-0 right-1.5 whitespace-nowrap text-xs font-extrabold text-cyan-300">
                  target {(tgtShown ?? avg).toFixed(2)}
                </span>
              </div>
              <div className="absolute left-0 right-0 bottom-[34px] h-1 rounded bg-gradient-to-r from-violet-500/60 to-cyan-400/60" />
              <div className="nums absolute left-0 right-0 bottom-3 flex justify-between text-[10px] text-[#6E749A]">
                <span className="after:content-['0']" /><span className="after:content-['25']" /><span className="after:content-['50']" /><span className="after:content-['75']" /><span className="after:content-['100']" />
              </div>
              {pins.map((s, i) => {
                const p = findPlayer(s.socketId);
                const isWin = winnerIds.includes(s.socketId);
                const isVoid = invalidIds.has(s.socketId);
                return (
                  <div
                    key={s.socketId}
                    className={twMerge("nw-rv-pin absolute flex flex-col items-center", !isWin && "nw-rv-dim")}
                    style={{ left: `calc(${clampPct(s.number)}% - 17px)`, bottom: `${44 + s.lane * 46}px`, transitionDelay: `${i * 0.1}s` }}
                  >
                    {isWin && (
                      <svg className="nw-rv-crown absolute -top-6 text-amber-400" width="24" height="20" viewBox="0 0 24 20" fill="currentColor"><path d="M2 5l5 5 5-8 5 8 5-5-2 13H4L2 5z" /></svg>
                    )}
                    <div className={twMerge(
                      "w-[34px] h-[34px] rounded-full bg-[#1A1E38] border-2 flex items-center justify-center text-[17px]",
                      isWin ? "nw-rv-win border-violet-400" : isVoid ? "border-red-400/60 opacity-60" : "border-white/20"
                    )}>
                      <span className="after:content-[attr(data-a)]" data-a={p?.avatar || "?"} />
                    </div>
                    {/* Number via CSS so the text isn't duplicated in the DOM */}
                    <span
                      data-n={s.number}
                      className={twMerge(
                        "nums mt-0.5 text-[11px] font-bold after:content-[attr(data-n)]",
                        isWin ? "text-amber-200" : isVoid ? "text-red-300 line-through" : "text-[#B4B9D6]"
                      )}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Average × multiplier = Target */}
        <div className="nw-rv-eq flex items-stretch gap-2">
          <div className="flex-1 rounded-2xl bg-black/30 border border-white/[0.08] px-3 py-2.5 text-center">
            <p className="label-muted mb-0.5 mt-0">Average</p>
            <p className="nums text-2xl font-extrabold text-white m-0">
              {avg != null ? avg.toFixed(2) : "—"}
            </p>
          </div>
          <div className="nums flex items-center text-sm font-bold text-[#8F95B8]">×{multiplier ?? ""}</div>
          <div className="flex-1 rounded-2xl bg-cyan-400/[0.08] border border-cyan-400/30 px-3 py-2.5 text-center">
            <p className="label-muted mb-0.5 mt-0">Target</p>
            <p className="nums text-2xl font-extrabold text-cyan-300 m-0">
              {tgt != null ? tgt.toFixed(2) : "—"}
            </p>
          </div>
        </div>

        {/* Special-rule banners */}
        {(result.exactMatch || result.twoPlayerCycle || isMultiWin) && (
          <div className="nw-rv-late flex flex-col gap-1.5">
            {result.exactMatch && (
              <div className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-200 bg-amber-500/10">
                ⚡ Exact match! Opponents get <strong>+2 pts</strong>
              </div>
            )}
            {result.twoPlayerCycle && (
              <div className="text-xs px-3 py-1.5 rounded-lg border border-orange-500/30 text-orange-200 bg-orange-500/10">
                ⚔️ 2-player special rule applied
              </div>
            )}
            {isMultiWin && (
              <div className="text-xs px-3 py-1.5 rounded-lg border border-cyan-500/30 text-cyan-200 bg-cyan-500/10">
                🤝 Tie — multiple winners!
              </div>
            )}
          </div>
        )}

        {/* Submissions, closest first */}
        <section className="flex flex-col gap-1.5">
          <div className="flex justify-between px-1 label-muted">
            <span>Submissions</span><span>Penalty</span>
          </div>
          {rows.map((s, i) => {
            const player    = findPlayer(s.socketId);
            const isWinner  = winnerIds.includes(s.socketId);
            const isInvalid = invalidIds.has(s.socketId);
            const isOut     = eliminated.has(s.socketId);
            return (
              <div
                key={s.socketId}
                className={twMerge(
                  "nw-rv-row flex items-center gap-2.5 px-3 py-2.5 rounded-[14px] border text-sm",
                  isWinner ? "bg-amber-400/10 border-amber-400/45"
                    : isOut ? "bg-red-500/[0.08] border-red-400/30"
                    : isInvalid ? "bg-red-500/[0.06] border-red-400/20"
                    : "bg-white/[0.04] border-white/[0.08]"
                )}
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <span className={twMerge("flex-1 min-w-0 truncate", isWinner ? "font-extrabold text-amber-100" : "text-white/80")}>
                  {player ? `${player.avatar} ${player.name}` : s.socketId}
                  {isInvalid && <span className="text-xs ml-1 text-red-300">(duplicate)</span>}
                </span>
                <span className={twMerge("nums font-extrabold w-8 text-right", isInvalid ? "text-red-300 line-through" : isWinner ? "text-amber-200" : "text-white")}>
                  {s.number}
                </span>
                {hasLine && (
                  <span className="nums text-[11px] text-[#8F95B8] w-[52px] text-right">
                    Δ {Math.abs(s.number - tgt).toFixed(2)}
                  </span>
                )}
                <span
                  className={twMerge(
                    "nw-rv-chip nums w-12 text-center py-0.5 rounded-full text-[11px] font-extrabold",
                    isWinner ? "bg-amber-400 text-[#1A1206]"
                      : isOut ? "bg-red-500 text-white"
                      : "bg-red-500/15 border border-red-400/45 text-red-200"
                  )}
                  style={{ transitionDelay: `${0.5 + i * 0.1}s` }}
                >
                  {isWinner ? "WIN" : isOut ? "OUT" : `+${penalty}`}
                </span>
              </div>
            );
          })}
        </section>

        {/* Eliminations */}
        <div className="nw-rv-late">
          {result.newlyEliminated?.length > 0 ? (
            <div className="rounded-[14px] px-3.5 py-3 text-sm text-red-200 border border-red-500/35 bg-red-500/10">
              ☠️ Eliminated:{" "}
              {result.newlyEliminated.map((id) => {
                const p = findPlayer(id);
                return p ? `${p.avatar} ${p.name}` : id;
              }).join(", ")}
            </div>
          ) : (
            <p className="text-xs text-[#6E749A] text-center m-0">No eliminations this round.</p>
          )}
        </div>

        {/* Next round countdown */}
        <footer className="flex flex-col gap-1.5 mt-auto">
          <div className="flex items-center justify-between">
            <p className="text-xs text-violet-300 font-semibold m-0">
              {countdown > 0 ? `Next round starting in ${countdown}s…` : "Starting next round…"}
            </p>
            <button onClick={handleSkip} className="min-h-[44px] px-2 text-sm font-bold text-violet-200 hover:text-white transition">
              Skip
            </button>
          </div>
          <div className="h-1 rounded-full bg-white/[0.08] overflow-hidden" aria-hidden="true">
            <div className="nw-rv-nextbar h-full bg-gradient-to-r from-violet-500 to-cyan-400" />
          </div>
        </footer>
      </div>
    </div>
  );
}

RoundResultOverlay.propTypes = {
  result: PropTypes.object,
  voidData: PropTypes.object,
  players: PropTypes.array,
  onDismiss: PropTypes.func,
  roomId: PropTypes.string,
};
