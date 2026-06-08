/**
 * soundManager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Procedural sound effects via Web Audio API — zero asset files needed.
 * All sounds are synthesised with oscillators and gain envelopes.
 *
 * Public API:
 *   soundManager.playSubmit()       — soft confirmation click
 *   soundManager.playRoundStart()   — ascending ding on new round
 *   soundManager.playWin()          — cheerful ascending chord
 *   soundManager.playLose()         — short descending blip
 *   soundManager.playElimination()  — dramatic descending sweep
 *   soundManager.playExactMatch()   — sparkly arpeggio
 *   soundManager.playTimerTick()    — metronome tick (use at ≤10s)
 *   soundManager.setMuted(bool)
 *   soundManager.isMuted()          → bool
 */

let _ctx = null;
let _muted = false;

function getCtx() {
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      return null;
    }
  }
  // Resume if suspended (browser autoplay policy)
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

// ── Low-level helpers ─────────────────────────────────────────────────────────

function osc(ctx, type, freq, start, duration, gainPeak, gainEnd) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g);
  g.connect(ctx.destination);
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gainPeak, start + 0.01);
  g.gain.exponentialRampToValueAtTime(Math.max(gainEnd, 0.001), start + duration);
  o.start(start);
  o.stop(start + duration + 0.05);
}

function chord(ctx, freqs, start, duration, peak) {
  freqs.forEach((f) => osc(ctx, "sine", f, start, duration, peak, 0.001));
}

// ── Public sound functions ────────────────────────────────────────────────────

function playSubmit() {
  const ctx = getCtx();
  if (!ctx || _muted) return;
  const t = ctx.currentTime;
  osc(ctx, "sine", 880, t, 0.12, 0.15, 0.001);
  osc(ctx, "sine", 1100, t + 0.05, 0.08, 0.08, 0.001);
}

function playRoundStart() {
  const ctx = getCtx();
  if (!ctx || _muted) return;
  const t = ctx.currentTime;
  osc(ctx, "triangle", 440, t, 0.15, 0.2, 0.001);
  osc(ctx, "triangle", 554, t + 0.1, 0.15, 0.2, 0.001);
  osc(ctx, "triangle", 659, t + 0.2, 0.2, 0.25, 0.001);
}

function playWin() {
  const ctx = getCtx();
  if (!ctx || _muted) return;
  const t = ctx.currentTime;
  // C major arpeggio: C5 E5 G5 C6
  [523, 659, 784, 1047].forEach((f, i) => {
    osc(ctx, "triangle", f, t + i * 0.1, 0.3, 0.22, 0.001);
  });
}

function playLose() {
  const ctx = getCtx();
  if (!ctx || _muted) return;
  const t = ctx.currentTime;
  osc(ctx, "sawtooth", 300, t, 0.25, 0.1, 0.001);
  osc(ctx, "sawtooth", 220, t + 0.12, 0.2, 0.08, 0.001);
}

function playElimination() {
  const ctx = getCtx();
  if (!ctx || _muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g);
  g.connect(ctx.destination);
  o.type = "sawtooth";
  o.frequency.setValueAtTime(440, t);
  o.frequency.linearRampToValueAtTime(110, t + 0.6);
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  o.start(t);
  o.stop(t + 0.7);
}

function playExactMatch() {
  const ctx = getCtx();
  if (!ctx || _muted) return;
  const t = ctx.currentTime;
  // Sparkly high arpeggio
  [1047, 1319, 1568, 2093, 1568, 1319, 1047].forEach((f, i) => {
    osc(ctx, "sine", f, t + i * 0.07, 0.15, 0.15, 0.001);
  });
}

function playTimerTick() {
  const ctx = getCtx();
  if (!ctx || _muted) return;
  const t = ctx.currentTime;
  osc(ctx, "square", 1200, t, 0.05, 0.08, 0.001);
}

function setMuted(val) { _muted = !!val; }
function isMuted() { return _muted; }

const soundManager = {
  playSubmit,
  playRoundStart,
  playWin,
  playLose,
  playElimination,
  playExactMatch,
  playTimerTick,
  setMuted,
  isMuted,
};

export default soundManager;
