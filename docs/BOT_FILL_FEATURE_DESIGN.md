# Feature Design: "Play with Bots" Fallback

**Author:** Senior architecture pass (AI-assisted)
**Date:** 2026-06-12
**Status:** Design + reference implementation

---

## 0. Summary

When a brand-new **public** room can't find enough real players within a short window
(`MIN_PLAYERS` not reached), the server fills the remaining seats with **bot players**
so the player who's waiting can still play a full game. Bots submit numbers
automatically, participate in round resolution exactly like real players, and are
excluded from persistence (stats/XP/achievements) because they have no `deviceId`.

**Scope note (revised):** this feature is **public-room only**. Private rooms are for
playing with invited friends, and bots filling in for absent friends was judged to be
poor UX (see Product/UX discussion below) — private rooms never receive bots. The
related "I want to play solo against bots on purpose" need is addressed by a separate,
standalone **"Play vs Computer"** mode, proposed in `PLAY_VS_COMPUTER_PROPOSAL.md`,
which reuses this feature's bot infrastructure (`botService.js`) but is a distinct
entry point rather than a fallback inside Public/Private rooms.

This is implemented as **additive** changes only:
- No existing socket event payload loses fields or changes meaning.
- No Prisma/PostgreSQL schema changes.
- No new client-side state library introduced.

---

## 1. Current Architecture (relevant slice)

```
Client (React 19 + Context API)            Server (Node/Express + Socket.IO + Redis)
─────────────────────────────────           ─────────────────────────────────────────
RoomTypeOverlay ──"join_room"──────────────▶ lobby.js: join_room
  │                                              ├─ public: getPublicRooms() (Redis SET)
  │                                              ├─ private: addUserToRoom(roomId, …)
  │                                              └─ emits "room_update" (full room JSON)
GameContext (onRoomUpdate)
  ├─ players = room.users
  ├─ if users.length >= MIN_PLAYERS && public → isInGame=true
  └─ else → isWaitingRoom=true

WaitingRoom
  ├─ canStart = players.length >= MIN_PLAYERS
  └─ host clicks "Start Game" ──"start_game"──▶ game.js: start_game
                                                   ├─ createGameData() (gameManager.js)
                                                   ├─ emits "next_round"
                                                   └─ timerService.startTimer(...)

GameBoard / NumwitRuleContext (onNextRound)
  └─ renders NumberInput ──"send_number"─────▶ game.js: send_number
                                                   ├─ writes game.numbers[socketId]
                                                   ├─ when submittedCount == activePlayers
                                                   │   → resolveRound()
                                                   └─ resolveRound emits "round_result",
                                                      "player_eliminated", "next_round"
                                                      or "game_over" + persistGameOver()
```

Key data structures (Redis, `room:{roomId}`):

```js
{
  id, type, users: [{ socketId, name, avatar, deviceId, socketId, ... }],
  hostSocketId, code, isTutorial,
  game: {
    round, numbers: {}, points: {}, turnOrder: [],
    eliminatedPlayers: [], submittedCount, status,
    average, target, winnerIds, winnerSocketId,
    settings: { timerDuration, eliminationThreshold, targetMultiplier, duplicateRuleEnabled },
    winHistory: {}, exactMatchHistory: {}, pendingJoiners: []
  }
}
```

`MIN_PLAYERS = 3` (server `constants/constants.js` and client `constants/constants.jsx`,
kept in sync manually — both stay unchanged by this feature).

`server/services/botService.js` already exists but is **dead code** — it was scaffolded
for a "Solo Tutorial" mode (per `TECHNICAL_IMPLEMENTATION_PLAN.md` §1.10 and
`UX_DESIGN_REVIEW.md` §3.2) and is not imported anywhere. This feature **repurposes and
extends it** rather than building parallel infrastructure.

---

## 2. Impacted Modules

| File | Change type | Why |
|---|---|---|
| `server/services/botService.js` | Rewritten | Generalize from "tutorial-only" to "fill any room"; add submission scheduling + adaptive bot strategy |
| `server/constants/constants.js` | Additive constants | `BOT_FILL_DELAY_MS`, `BOT_NAMES`, `BOT_AVATARS`, `MAX_BOTS_PER_FILL` |
| `server/socketHandlers/lobby.js` | Extended | Start a bot-fill timer for brand-new public rooms; cleanup when only bots remain |
| `server/socketHandlers/game.js` | Refactored + extended | Extract `startGameForRoom()` and `submitNumber()` so bot-fill and bot auto-submission can reuse the exact same round-resolution path as real players |
| `server/utils/roomManager.js` | Additive | `deleteRoom(roomId)` helper for bots-only cleanup |
| `client/src/components/WaitingRoom.jsx` | Extended | Show bot badges, bot-fill countdown (public rooms only) |
| `client/src/contexts/GameContext.jsx` | Additive | Track `botFillAt` from `room_update` for the countdown |
| `client/src/components/PlayerScorePanel.jsx` | Additive | 🤖 badge for bot players in the score list |
| `server/socketHandlers/*.test.js` (new) | New tests | Cover bot-fill + bot-submission flows |

**Not changed:** Prisma schema, REST API, `gameRules.js`, `gameManager.js` (turn order
already accepts arbitrary socket-id strings), `timerService.js`, voice/chat/emote
handlers, client routing in `App.jsx`.

---

## 3. Backward Compatibility Check

| Surface | Before | After | Compatible? |
|---|---|---|---|
| `room_update` payload | `room` JSON | same `room` JSON, plus optional `botFillAt: number\|null` field and possible bot entries (`isBot: true`) in `users[]` | ✅ additive field; old clients ignore unknown keys |
| `join_room` / `leave_room` / `start_game` / `send_number` / `restart_game` | unchanged request shape | unchanged | ✅ |
| `next_round` / `game_in_progress` | `turnOrder: string[]` | `turnOrder` may contain `bot-<roomId>-<n>` strings — same type | ✅ |
| `round_result` / `player_eliminated` / `game_over` | unchanged shape | unchanged; bot socketIds appear in the same arrays/maps real players would | ✅ |
| New event `bots_added` (server→client) | n/a | new, informational | ✅ old clients that don't listen simply don't show the toast |
| Private rooms | bots never appear | bots never appear (unchanged — feature is public-room only) | ✅ no behavior change for private rooms |
| Prisma schema (`users`, `game_sessions`, `session_stats`) | — | unchanged | ✅ bots never have `deviceId`, so `persistGameOver`'s existing `if (!deviceId) continue` guard already excludes them |
| `MIN_PLAYERS`, `MAX_PLAYERS`, elimination rules | 3 / 8 / threshold 5 | unchanged | ✅ |
| Voice chat (WebRTC) | real peers only | unchanged — bots never join voice | ✅ |

No existing socket handler's success path changes for human-only rooms: if a room
reaches `MIN_PLAYERS` with real players before the bot-fill timer fires, the timer's
guard (`room.users.length < MIN_PLAYERS`) makes it a no-op.

---

## 4. Assumptions

1. "No users available" = a newly-created **public** room stays below `MIN_PLAYERS`
   (3) for `BOT_FILL_DELAY_MS` (default 15s). Private rooms are explicitly **out of
   scope** — see scope note in §0. A host wanting to play solo against bots on demand
   is a different need, addressed separately by the proposed "Play vs Computer" mode.
2. `MIN_PLAYERS` stays 3 — bots only fill the gap up to 3 real+bot players. This keeps
   `gameRules.js` (2-player cycle rule, duplicate rule, etc.) entirely unchanged.
3. Bots are server-simulated only: fixed name/avatar pool, no persistent profile, no
   `deviceId`, no XP/achievements/leaderboard rows, no voice participation.
4. **"Keep Redux Toolkit" constraint:** the codebase has **no Redux / @reduxjs/toolkit**
   dependency anywhere (verified in `client/package.json`, `server/package.json`, and a
   full-repo grep) — state is managed entirely via React Context
   (`UserContext`, `GameContext`, `NumwitRuleContext`, etc.). This constraint is
   interpreted as **"do not introduce a new global state-management library — keep the
   existing Context-based architecture"**, which this design fully respects (only
   additive `useState` fields in existing providers). If a real Redux Toolkit migration
   was intended, that is a separate, much larger effort and should be confirmed
   separately before starting it.
5. `server/services/botService.js` is currently unused scaffolding tied to a
   never-wired "Solo Tutorial" concept — safe to rewrite/extend without breaking
   anything that calls it today (nothing does).
6. Bot fill timer of 15s is a reasonable default; exposed as a constant so it can be
   tuned without code changes elsewhere.
7. Maximum bots added per fill = `MIN_PLAYERS - currentRealUserCount`, never exceeding
   `MAX_PLAYERS` (8).

---

## 5. Design Approach

### 5.1 Fill trigger: public-room automatic timeout fill

When `join_room` creates a brand-new public room (no joinable room found by
`getPublicRooms()`), the server stamps `room.botFillAt = Date.now() + BOT_FILL_DELAY_MS`
and schedules an in-memory timer (`botService.scheduleBotFill`). When it fires:
- Re-fetch the room from Redis.
- If `room.game` already exists, or `room.users.length >= MIN_PLAYERS`, or the room
  was deleted → no-op (covers the case where real players joined in time).
- Otherwise, fill bots up to `MIN_PLAYERS`, save, emit `room_update` + `bots_added`,
  and **immediately call `startGameForRoom()`** with default settings — there's no
  human "host" to click Start in this scenario, so the server starts the game itself,
  exactly as if the host had clicked "Start Game".

Private rooms never trigger a bot fill — `isNewPublicRoom` (and therefore
`botFillAt`/`scheduleBotFill`) is only ever set for `roomType === "public"`.

### 5.2 Bot lifecycle inside a game

- Bots are pushed into `room.users` as plain user objects:
  `{ socketId: "bot-<roomId>-<n>", name, avatar, isBot: true }` (no `deviceId`).
- `createGameData()` (unchanged) builds `turnOrder` from `room.users` socket ids — bot
  ids are included automatically, no change needed there.
- After every `next_round` emission (both the initial `start_game`/`startGameForRoom`
  call and the subsequent-round path inside `resolveRound`'s 5s delay), the server
  calls `botService.scheduleBotSubmissions(io, room, submitNumber)`. Each bot picks a
  number after a random 1–4s delay and calls the **same `submitNumber()` function**
  used by the `send_number` socket handler — so bots go through identical validation,
  duplicate-rule, void-round, elimination, and persistence logic as real players.
- Bot numbers: round 1 → weighted random in [30,70]; round ≥2 → biased around the
  previous round's `target` (± random spread), approximating "trying to guess the
  target" the way `TECHNICAL_IMPLEMENTATION_PLAN.md` originally described for tutorial
  bots.
- `persistGameOver()` already skips any user without `deviceId` — **zero changes
  needed** for stats/XP/achievements to correctly ignore bots.

### 5.3 Cleanup

- `botService.clearFillTimer(roomId)` / `removeRoom(roomId)` called whenever a room is
  deleted (game over with no active room, or `removeUserFromRoom` empties it).
- If the last **real** user leaves a room that still contains only bots,
  `removeUserFromRoom`'s result is checked in `lobby.js`: if
  `room.users.every(u => u.isBot)`, the room is deleted outright
  (`roomManager.deleteRoom`) and bot state is cleared — bots never "play alone".

---

## 6. Data Flow Diagrams

### 6.1 Public room — nobody else joins in time

```
User A                Server                              Redis
  │  join_room          │                                   │
  ├────────────────────▶│ getPublicRooms() → none           │
  │                      │ create room R, botFillAt=T+15s    │
  │                      ├──────────────────────────────────▶ SET room:R
  │ ◀── room_update ─────┤ (users=[A], botFillAt=T+15s)      │
  │                      │ scheduleBotFill(R, +15s)           │
  │                      │                                   │
  │                  ... 15 seconds pass, no one else joins ...
  │                      │ timer fires → re-GET room:R        │
  │                      │ users.length(1) < MIN_PLAYERS(3)   │
  │                      │ fillRoomWithBots(R, +2 bots)        │
  │                      ├──────────────────────────────────▶ SET room:R (users=[A,bot1,bot2])
  │ ◀── room_update ─────┤ (users=[A,bot1,bot2])              │
  │ ◀── bots_added ──────┤ { bots:[bot1,bot2] }               │
  │                      │ startGameForRoom(R) (server-side)  │
  │ ◀── game_started ────┤                                     │
  │ ◀── next_round ──────┤ turnOrder=[A,bot1,bot2]             │
  │                      │ scheduleBotSubmissions(R)           │
  │  send_number(A)      │                                     │
  ├────────────────────▶│ submitNumber(A, n)                  │
  │                      │ ... bot1, bot2 submit after 1-4s ...│
  │                      │ submittedCount==3 → resolveRound()  │
  │ ◀── round_result ────┤                                     │
```

(Private rooms have no equivalent flow — bots are never added there.)

---

## 7. API Changes

All changes are **additive**. No existing event's required fields change.

### 7.1 New: `bots_added` (server → client)

```js
io.to(roomId).emit("bots_added", {
  roomId: "abc123",
  bots: [
    { socketId: "bot-abc123-0", name: "Bot Ada",  avatar: "🤖", isBot: true },
    { socketId: "bot-abc123-1", name: "Bot Theo", avatar: "👾", isBot: true },
  ],
});
```
- Purely informational (drives a toast / chat-system message). Clients that don't
  listen for it still get the bots via `room_update.users`.

### 7.2 Extended: `room_update` (server → client) — unchanged shape, new optional fields

```js
{
  id, type, users: [ ...existing fields..., /* bots: */ { socketId, name, avatar, isBot: true } ],
  hostSocketId, code,
  botFillAt: 1749740000000 | null,   // NEW — epoch ms when auto-fill will trigger, or null
  game: { ... }                       // unchanged
}
```

### 7.3 Unchanged events

`join_room`, `leave_room`, `start_game`, `send_number`, `restart_game`, `next_round`,
`round_result`, `round_void`, `player_eliminated`, `game_over`, `game_reset`,
`waiting_for_players`, `number_received`, `timer_tick`, `timer_expired`,
`game_in_progress`, achievements/XP/voice/chat/emote events — **all unchanged**.
`turnOrder`/`eliminatedPlayers`/`points`/`winHistory`/etc. may now contain
`bot-<roomId>-<n>` socket-id strings, which were always typed as opaque strings.

---

## 8. UI Changes

### 8.1 `WaitingRoom.jsx`

- Each player row: if `player.isBot`, append a small "🤖 Bot" pill next to the name.
- **Public rooms only**, while `players.length < MIN_PLAYERS` and `botFillAt` is set:
  show "Looking for players… adding bots in `Ns`" with a small live countdown derived
  from `botFillAt - Date.now()`.
- Private rooms render exactly as before — no bot-related UI.

### 8.2 `GameContext.jsx`

- New `botFillAt` state, set from `room_update.botFillAt`, exposed via context for
  `WaitingRoom` to render the countdown. No change to existing `players`/`hostSocketId`
  semantics.

### 8.3 `PlayerScorePanel.jsx` (in-game)

- Players with `isBot: true` get a small 🤖 prefix badge so users understand why some
  opponents respond instantly / never talk in voice chat.

### 8.4 No changes to

`App.jsx` routing, `Login.jsx`, `LandingPage.jsx`, `RoomTypeOverlay.jsx`,
`GameSettingsPanel.jsx`, `NumberInput`/`NumberGrid`, `RoundResultOverlay`,
`GameOverScreen`, voice/chat/emote components.

---

## 9. Database Changes

**None.**

- Redis `room:{roomId}` gains two additive fields: `botFillAt` (room-level) and
  `isBot: true` (per bot user object). Both are JSON fields in a value that's already
  freeform (`JSON.stringify(room)`), so no migration is needed and old data without
  these fields parses fine (`undefined`/falsy, treated as "no bots / no pending fill").
- PostgreSQL (`users`, `game_sessions`, `session_stats`, achievements) — **unchanged**.
  Bots never call `upsertUser` (no `deviceId`), and `persistGameOver`'s existing
  `if (!deviceId) continue` guard means bots never produce DB rows, never earn XP, and
  never appear on leaderboards.

---

## 10. Code Implementation

All changes below have been applied to the repository. Summary per file:

### 10.1 `server/constants/constants.js` (additive)

```js
// ── Bot-fill feature ──────────────────────────────────────────────────────────
// How long a brand-new public room waits for real players before the server
// fills the remaining seats (up to MIN_PLAYERS) with bots and starts the game.
const BOT_FILL_DELAY_MS = 15000;

// Bot identity pools (cycled with modulo if more bots are needed than entries).
const BOT_NAMES = ["Bot Ada", "Bot Theo", "Bot Lin", "Bot Max", "Bot Nia", "Bot Vex"];
const BOT_AVATARS = ["🤖", "👾", "🦾", "🧠", "🛰️", "⚙️"];
```
Exported alongside existing constants. `MIN_PLAYERS`/`MAX_PLAYERS` untouched.

### 10.2 `server/services/botService.js` (rewritten — was dead scaffolding)

Exports:
- `isBot(socketId)` — `socketId.indexOf("bot-") === 0`.
- `hasOnlyBots(room)` — true if every `room.users` entry is a bot.
- `fillRoomWithBots(room, targetCount)` — mutates `room.users`, pushes
  `{ socketId: "bot-<roomId>-<n>", name, avatar, isBot: true }` (cycling
  `BOT_NAMES`/`BOT_AVATARS`) until `room.users.length === targetCount`. Returns the
  added bot objects. Skips existing bot indices so repeated fills don't collide.
- `scheduleBotFill(roomId, delayMs, onFire)` / `clearFillTimer(roomId)` — one-shot
  timer for the public-room auto-fill check.
- `getBotNumber(game)` — round 1: 70% chance of 30–70, else 0–100; round ≥2: previous
  `target ± 15`, clamped to [0,100].
- `scheduleBotSubmissions(roomId, game, submitFn)` / `clearSubmissionTimers(roomId)` —
  for each bot in `game.turnOrder` that hasn't submitted and isn't eliminated,
  schedules `submitFn(botSocketId, getBotNumber(game))` after a random 1–4s delay.
- `removeRoom(roomId)` — clears both timer maps for a room (full cleanup).

State is two module-level `Map`s (`fillTimers`, `submissionTimers`) keyed by `roomId`.

### 10.3 `server/utils/roomManager.js` (additive)

```js
// ── deleteRoom (bot-fill cleanup: room with only bots left) ────────────────────
async function deleteRoom(roomId) {
  await redis.del(getRoomKey(roomId));
  await redis.sRem(PUBLIC_ROOMS_SET, roomId);
}
```
Added to `module.exports`. No existing function signatures changed.

### 10.4 `server/socketHandlers/game.js` (refactored + extended)

- `start_game` handler now just validates the host, then delegates to the new
  exported `startGameForRoom(io, roomId, settings)` — identical behavior to before,
  but reusable from `lobby.js` for server-initiated starts.
- `startGameForRoom`: re-fetches room, `removeFromPublicSet`, emits `game_started` +
  `createGameData`, then (after the existing 300ms delay) emits `next_round`, starts
  the round timer, and calls
  `botService.scheduleBotSubmissions(roomId, gameData, (botSocketId, number) =>
  submitBotNumber(io, roomId, botSocketId, number))`.
- New shared `submitNumber(io, room, socketId, number)` — extracted from the old
  inline `send_number` logic: writes `game.numbers[socketId]`, increments
  `submittedCount`, and either emits `waiting_for_players` or clears timers
  (`timerService.clearTimer` + `botService.clearSubmissionTimers`) and calls
  `resolveRound`.
- `send_number` handler: unchanged validation, now ends with
  `socket.emit("number_received", {no: number}); await submitNumber(io, room, socket.id, number);`
- New `submitBotNumber(io, roomId, botSocketId, number)` — re-fetches the room (bot
  "thinking" delay may be stale), re-validates (`turnOrder`, not eliminated, not
  already submitted, round not `COMPLETED`), then calls `submitNumber`. Mirrors the
  `send_number` guards exactly.
- `restart_game` handler additionally calls `botService.clearSubmissionTimers(roomId)`.
- `resolveRound`: after restarting the timer in the `roundVoid` branch, and after
  starting the next round's timer in the 5s-delay branch, calls
  `botService.scheduleBotSubmissions(...)` again so bots play every round. In the
  `game_over` branch, calls `botService.clearSubmissionTimers(roomId)`.
- `persistGameOver`: comment updated to `// skip users without device identity
  (includes all bots)` — logic (`if (!deviceId) continue`) unchanged.
- `module.exports.startGameForRoom = startGameForRoom` attached to the exported
  handler function so `lobby.js` can call it without a circular-dependency issue
  (`game.js` does not require `lobby.js`).

### 10.5 `server/socketHandlers/lobby.js` (extended)

- New imports: `getRoomById`, `deleteRoom` from `roomManager`; `BOT_FILL_DELAY_MS`
  from constants; `botService`; `startGameForRoom` from `./game`.
- `join_room`: tracks `isNewPublicRoom` (true when a public room is created because
  `getPublicRooms()` found nothing — only ever true for `roomType === "public"`).
  After `addUserToRoom`, if it's a new public room, `!room.game`, and
  `room.users.length < MIN_PLAYERS`, sets
  `room.botFillAt = Date.now() + BOT_FILL_DELAY_MS`, saves, and calls
  `botService.scheduleBotFill(roomNo, BOT_FILL_DELAY_MS, (rid) =>
  fillRoomWithBotsAndStart(io, rid))`. `room_update` is still emitted to everyone as
  before. Private rooms never set `botFillAt` and never schedule a fill timer.
- `leave_room` / `disconnect`: now call shared `cleanupIfBotsOnly(io, room)` instead
  of emitting `room_update` directly. `disconnect` keeps its existing
  `opponent_disconnected` `game_over` emission first.
- New helper `cleanupIfBotsOnly(io, room)`: if `botService.hasOnlyBots(room)`, clears
  the round timer, `botService.removeRoom(room.id)`, and `roomManager.deleteRoom`s the
  room (no further broadcast — the room no longer exists); otherwise emits
  `room_update` as before.
- New helper `fillRoomWithBotsAndStart(io, roomId)`: re-fetches the room; no-op if the
  room was deleted, a game already started, or real players already reached
  `MIN_PLAYERS` (in which case it just clears `botFillAt` and re-broadcasts). Otherwise
  fills bots to `MIN_PLAYERS`, clears `botFillAt`, saves, emits `room_update` +
  `bots_added`, then calls `startGameForRoom(io, roomId, {})`.

### 10.6 `client/src/contexts/GameContext.jsx` (additive)

- New state `botFillAt` (epoch ms or `null`), set from `room.botFillAt` in
  `onRoomUpdate`, reset to `null` in `resetGame`, and exposed via `providerValue`.
  `players`/`hostSocketId`/etc. semantics unchanged.

### 10.7 `client/src/components/WaitingRoom.jsx` (extended)

- Destructures `botFillAt` from `useGame()`.
- New `fillCountdown` state + `useEffect` that ticks every second while `botFillAt` is
  set, computing `Math.max(0, ceil((botFillAt - Date.now()) / 1000))`.
- Each player row: if `player.isBot`, renders a "🤖 Bot" pill (in addition to the
  existing "👑 Host" pill). This only ever applies to public rooms in practice, but the
  badge itself is harmless to render generically.
- Public rooms, while `!canStart` and `fillCountdown !== null`: renders "Looking for
  players… adding bots in `Ns`".
- No "Fill with Bots" button — removed per the public-only scope decision; private
  rooms have no bot-related UI.

### 10.8 `client/src/components/PlayerScorePanel.jsx` (additive)

- Each score row appends `" 🤖"` after the player's name when `p.isBot` is true.

---

## 11. Test Cases

Server-side tests are Jest unit/integration tests under
`server/socketHandlers/__tests__/` and `server/services/__tests__/`, following the
project's `TC-<AREA>-<NNN>` ID convention. Redis and `io` are mocked
(`jest.mock("../../redisClient")`, a fake `io.to(room).emit` recorder) so tests run
without a live Redis/Socket.IO server. Bot submission timers (`setTimeout`) are
controlled with `jest.useFakeTimers()`.

### 11.1 `botService` unit tests (`TC-BOT-0xx`)

| ID | Scenario | Expected result |
|---|---|---|
| TC-BOT-001 | `isBot("bot-abc123-0")` / `isBot("sock-xyz")` / `isBot(undefined)` | returns `true` / `false` / `false` |
| TC-BOT-002 | `hasOnlyBots(room)` with `users=[{isBot:true},{isBot:true}]` | returns `true` |
| TC-BOT-003 | `hasOnlyBots(room)` with `users=[{isBot:true},{socketId:"real"}]` | returns `false` |
| TC-BOT-004 | `hasOnlyBots(room)` with `users=[]` | returns `false` (empty room is not "bots only") |
| TC-BOT-005 | `fillRoomWithBots(room, 3)` on a room with 1 real user | adds 2 bots, `room.users.length === 3`, returned array has 2 entries each with `isBot:true` and unique `socketId`s matching `bot-<roomId>-0/1` |
| TC-BOT-006 | `fillRoomWithBots(room, 3)` called twice in a row (room already has 1 bot from a prior partial fill) | second call doesn't reuse `bot-<roomId>-0` — new bot index continues from existing bot count |
| TC-BOT-007 | `fillRoomWithBots(room, 2)` on a room already at 2 users | returns `[]`, `room.users` unchanged |
| TC-BOT-008 | `getBotNumber({ target: null })` called 1000x | all results in [0,100]; majority (≈70%) fall in [30,70] |
| TC-BOT-009 | `getBotNumber({ target: 50 })` called 1000x | all results in [0,100], all within [35,65] (target ± 15) |
| TC-BOT-010 | `getBotNumber({ target: 5 })` (near lower clamp) | results clamp to `>= 0`, never negative |
| TC-BOT-011 | `getBotNumber({ target: 98 })` (near upper clamp) | results clamp to `<= 100` |
| TC-BOT-012 | `scheduleBotFill("R1", 1000, onFire)` then advance fake timers by 1000ms | `onFire("R1")` called exactly once |
| TC-BOT-013 | `scheduleBotFill("R1", 1000, onFire)` then `clearFillTimer("R1")`, advance timers | `onFire` never called |
| TC-BOT-014 | `scheduleBotSubmissions(roomId, game, submitFn)` where `game.turnOrder` has 1 real + 2 bot ids, none submitted | exactly 2 timers scheduled (one per bot); advancing fake timers by 4000ms calls `submitFn` twice, once per bot socketId, with a number in [0,100] |
| TC-BOT-015 | `scheduleBotSubmissions` where one bot already has `game.numbers[botId]` set | that bot is skipped — only the remaining bot gets a timer |
| TC-BOT-016 | `scheduleBotSubmissions` where a bot is in `game.eliminatedPlayers` | that bot is skipped |
| TC-BOT-017 | `clearSubmissionTimers(roomId)` after `scheduleBotSubmissions`, then advance timers | no `submitFn` calls occur |
| TC-BOT-018 | `removeRoom(roomId)` after both a pending fill timer and submission timers exist | both are cleared; subsequent timer advances trigger nothing |

### 11.2 `roomManager.deleteRoom` (`TC-ROOM-0xx`)

| ID | Scenario | Expected result |
|---|---|---|
| TC-ROOM-001 | `deleteRoom("R1")` on an existing public room | `redis.del("room:R1")` and `redis.sRem("public:rooms","R1")` both called once |
| TC-ROOM-002 | `getRoomById("R1")` after `deleteRoom("R1")` | returns `null` |

### 11.3 Private-room regression — no bot fill (`TC-LOBBY-0xx`)

| ID | Scenario | Expected result |
|---|---|---|
| TC-LOBBY-001 | Host creates a private room and only 1 real user ever joins | `room.botFillAt` is never set (`isNewPublicRoom` is false for `roomType === "private"`); `room_update.botFillAt` is `null`/absent; no `scheduleBotFill` call; `WaitingRoom` shows the normal "Waiting for N more players…" state, no bot UI |
| TC-LOBBY-002 | `lobby.js` is fully loaded | the `fill_bots` socket event is not registered — `socket.on("fill_bots", ...)` does not exist |
| TC-LOBBY-003 | A client emits `fill_bots` anyway (e.g. stale/old client build) | the server has no handler for it — Socket.IO silently ignores unknown events; no error, no bots added, room unaffected |

### 11.4 Public-room auto-fill (`TC-LOBBY-1xx`)

| ID | Scenario | Expected result |
|---|---|---|
| TC-LOBBY-101 | First player joins a public room with no existing joinable room | `room.botFillAt = now + BOT_FILL_DELAY_MS` set and saved; `room_update` includes `botFillAt`; a fill timer is scheduled |
| TC-LOBBY-102 | Second/third real player joins the same public room before the timer fires | `getPublicRooms()` returns the existing room (not a new one); `isNewPublicRoom` is false, no second timer scheduled; once `users.length >= MIN_PLAYERS`, existing room flow (unchanged) proceeds |
| TC-LOBBY-103 | Fill timer fires with `room.users.length === 1` (still below `MIN_PLAYERS`) | `fillRoomWithBotsAndStart` adds 2 bots, clears `botFillAt`, emits `room_update` + `bots_added`, then calls `startGameForRoom` → `game_started` and `next_round` are emitted |
| TC-LOBBY-104 | Fill timer fires but `room.users.length >= MIN_PLAYERS` already (real players joined in time) | no bots added; if `botFillAt` was still set, it's cleared and `room_update` re-emitted; `startGameForRoom` is **not** called |
| TC-LOBBY-105 | Fill timer fires but the room was deleted in the meantime (`getRoomById` returns `null`) | function returns immediately; no emits, no error |
| TC-LOBBY-106 | Fill timer fires but `room.game` already exists (game started by another path) | function returns immediately; no duplicate `game_started`/`next_round` |

### 11.5 Bots-only cleanup (`TC-LOBBY-2xx`)

| ID | Scenario | Expected result |
|---|---|---|
| TC-LOBBY-201 | Last real user calls `leave_room` in a room that now contains only bots | `cleanupIfBotsOnly` detects `hasOnlyBots`, clears the round timer, calls `botService.removeRoom` and `roomManager.deleteRoom`; **no** `room_update` is emitted (room no longer exists) |
| TC-LOBBY-202 | Last real user disconnects from a room with bots and an in-progress game | `game_over` (`reason: "opponent_disconnected"`) is emitted **before** the room is deleted; then `cleanupIfBotsOnly` deletes the room |
| TC-LOBBY-203 | A user leaves a room that still has ≥1 other real user (and possibly bots) | `hasOnlyBots` is false; `room_update` emitted as before; room not deleted |

### 11.6 Bot round submissions / game flow (`TC-GAME-0xx`)

| ID | Scenario | Expected result |
|---|---|---|
| TC-GAME-001 | `startGameForRoom` for a room with `turnOrder = [real, bot-R-0, bot-R-1]` | after the 300ms delay, `next_round` is emitted, the round timer starts, and `scheduleBotSubmissions` schedules 2 bot timers |
| TC-GAME-002 | Real player calls `send_number` first; both bots' timers fire afterward | each bot submission goes through `submitBotNumber` → `submitNumber`; after all 3 submit, `submittedCount === activePlayers.length`, timers are cleared, `resolveRound` runs once (not per-submission) |
| TC-GAME-003 | All bots submit before the real player | `waiting_for_players` emitted with `submitted: 2, total: 3` after each bot submission; `resolveRound` only runs once the real player submits |
| TC-GAME-004 | `submitBotNumber` fires for a bot that was eliminated in a prior round | `submitNumber` is **not** called (guard `eliminatedPlayers.indexOf(botSocketId) !== -1`); no double-counting of `submittedCount` |
| TC-GAME-005 | `submitBotNumber` fires for a bot that already has `game.numbers[botSocketId]` set (e.g. round already resolved) | no-op — guard `game.numbers[botSocketId] !== undefined` prevents duplicate submission |
| TC-GAME-006 | `submitBotNumber` fires after `game.status === COMPLETED` (round already resolved by real players) | no-op — guard on `NUMWIT_GAME_STATUS.COMPLETED` |
| TC-GAME-007 | Round resolves as `roundVoid` (duplicate-number rule) with bots in `turnOrder` | `round_void` emitted, timer restarted, `scheduleBotSubmissions` called again so bots re-submit for the replayed round |
| TC-GAME-008 | Round resolves to `game_over` (1 real player remaining, bots eliminated) | `botService.clearSubmissionTimers(roomId)` called; no further bot timers fire after game over |
| TC-GAME-009 | `restart_game` called by host while bot submission timers are pending | `botService.clearSubmissionTimers(roomId)` called; `game_reset` + `room_update` emitted; no stale bot submissions land after restart |
| TC-GAME-010 | Next-round transition (5s delay) for a room with bots | `scheduleBotSubmissions` is called again for the new round's `turnOrder`/`numbers` |

### 11.7 Persistence exclusion (`TC-PERSIST-0xx`)

| ID | Scenario | Expected result |
|---|---|---|
| TC-PERSIST-001 | `persistGameOver` runs for a finished game where `room.users` includes 2 real users (`deviceId` set) and 1 bot (`deviceId` undefined) | `statsService.writeSessionStat`, `userService.awardXp`, `achievementService.checkAndAward` are each called exactly **2 times** (once per real user) — never for the bot |
| TC-PERSIST-002 | Bot wins the game (`winnerPlayer.socketId` is a bot id) | real users' `sessionStats.survived` is computed correctly (`false`, since the bot won); no DB write attempted for the bot itself; no crash from missing `deviceId` |
| TC-PERSIST-003 | All `room.users` are bots (should not normally happen due to `cleanupIfBotsOnly`, but guard anyway) | loop body's `if (!deviceId) continue` skips every iteration; no DB calls made; function resolves without error |

### 11.8 Client UI (`TC-UI-0xx`, React Testing Library)

| ID | Scenario | Expected result |
|---|---|---|
| TC-UI-001 | `GameContext` receives `room_update` with `botFillAt: <future epoch ms>` | `useGame().botFillAt` equals that value |
| TC-UI-002 | `GameContext` receives `room_update` with no `botFillAt` field (older-shaped payload) | `useGame().botFillAt` is `null` (falls back via `room.botFillAt || null`) — no crash |
| TC-UI-003 | `resetGame()` is called | `botFillAt` resets to `null` |
| TC-UI-004 | `WaitingRoom` renders with `botFillAt` set ~10s in the future, public room, `players.length < MIN_PLAYERS` | "Looking for players… adding bots in `Ns`" is shown; the displayed `N` decreases by 1 each second |
| TC-UI-005 | `WaitingRoom` renders with `botFillAt = null` | the bot-fill countdown banner is not rendered |
| TC-UI-006 | `WaitingRoom` renders for a private room with `players.length < MIN_PLAYERS`, any host status | no bot-fill countdown, no "Fill with Bots" button — UI identical to pre-feature private-room waiting state |
| TC-UI-007 | `WaitingRoom` for a private room receives `room_update` with `botFillAt` unexpectedly set (defensive) | countdown banner is gated on `roomType === "public"`, so it does not render even if `botFillAt` is non-null |
| TC-UI-009 | Player row for `{ isBot: true, name: "Bot Ada", avatar: "🤖" }` | renders a "🤖 Bot" pill next to the name, in addition to (or instead of) the "👑 Host" pill if applicable |
| TC-UI-010 | `PlayerScorePanel` renders a player with `isBot: true` | the row label shows `"{avatar} {name} 🤖"` |
| TC-UI-011 | `PlayerScorePanel` renders a player with `isBot` absent/false | no trailing 🤖 (unchanged from before this feature) |

### 11.9 Backward-compatibility regression (`TC-COMPAT-0xx`)

| ID | Scenario | Expected result |
|---|---|---|
| TC-COMPAT-001 | Full game with 3 real players, no bots ever involved | identical behavior/events to pre-feature code — `botFillAt` stays `null` throughout, `scheduleBotSubmissions` schedules 0 timers (no bot ids in `turnOrder`) |
| TC-COMPAT-002 | Private room created, players join, and host starts the game | identical to pre-feature behavior — no bot-fill timer, no bot UI, no new socket events; `start_game` flow unchanged |
| TC-COMPAT-003 | Old client (pre-feature) connects and receives `room_update` containing `botFillAt` and bot users | client ignores unknown `botFillAt` field; bot users render like any other user (no `isBot` handling) — no crash |
| TC-COMPAT-004 | `persistGameOver` for a bot-free game | same DB writes/XP/achievements as before this feature (no regression from the refactor into `submitNumber`/`submitBotNumber`) |
