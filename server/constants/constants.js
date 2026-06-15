const ROOM_PREFIX = "room:";
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 3;
const ELIMINATION_THRESHOLD = 5;
const TOTAL_ROUNDS_DEFAULT = 3;

const NUMWIT_GAME_STATUS = {
  WAIT: "WAIT",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
};

// ── Bot-fill feature ──────────────────────────────────────────────────────────
// How long a brand-new public room waits for real players before the server
// fills the remaining seats (up to MIN_PLAYERS) with bots and starts the game.
const BOT_FILL_DELAY_MS = 15000;

// Bot identity pools (cycled with modulo if more bots are needed than entries).
const BOT_NAMES = ["Bot Ada", "Bot Theo", "Bot Lin", "Bot Max", "Bot Nia", "Bot Vex"];
const BOT_AVATARS = ["🤖", "👾", "🦾", "🧠", "🛰️", "⚙️"];

module.exports = {
  ROOM_PREFIX,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ELIMINATION_THRESHOLD,
  TOTAL_ROUNDS_DEFAULT,
  NUMWIT_GAME_STATUS,
  BOT_FILL_DELAY_MS,
  BOT_NAMES,
  BOT_AVATARS,
};
