export const avatars = ["😎", "👾", "🐱", "🦊", "🐸", "👻", "🧠", "🧙‍♂️"];
export const MIN_PLAYERS = 3;
export const ELIMINATION_THRESHOLD = 5;

// Computer-player difficulty for "Play vs Computer" (server: services/botBrain.js)
export const BOT_DIFFICULTIES = [
  { id: "adaptive", label: "Adaptive", icon: "🎯", blurb: "Matches your level — gets tougher as you win" },
  { id: "casual",   label: "Casual",   icon: "🙂", blurb: "Relaxed bots, good for learning" },
  { id: "sharp",    label: "Sharp",    icon: "🧠", blurb: "Reads your patterns and punishes them" },
  { id: "ruthless", label: "Ruthless", icon: "😈", blurb: "Near-perfect play. Good luck." },
];
