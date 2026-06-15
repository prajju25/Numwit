# 80 Percentile — Technical Implementation Plan
> Based on: UX_DESIGN_REVIEW.md (approved)
> Authors: Principal Architect · Staff Frontend · Staff Backend · Technical Lead
> Stack: React · Node.js · Socket.IO · Redis · Docker

---

## EXECUTIVE SUMMARY

The UX review identified 47 improvements across 4 impact tiers. This document translates each
into engineering work, sized by complexity, ordered by risk, and grouped into 4 delivery phases.

**Total estimated engineering effort:**
- Phase 1 (Core UX Fixes):         ~3–4 days
- Phase 2 (Social + Engagement):   ~5–7 days
- Phase 3 (Retention + Polish):    ~7–10 days
- Phase 4 (Scale + Platform):      ~10–14 days

**Critical path:** Phase 1 is a prerequisite for everything. Do not start Phase 2 until Phase 1
is fully tested and deployed. Each phase ships independently.

---

## 1. ARCHITECTURE IMPACT ANALYSIS

For each major UX change, the full-stack impact is mapped below.

---

### 1.1 Mobile Slider Input (replaces 101-button grid)

| Layer      | Impact |
|------------|--------|
| Frontend   | Replace `NumberGrid.jsx` with `NumberSlider.jsx`. Responsive: slider on mobile/tablet, grid on desktop (≥1024px breakpoint). No new context or state — same `onSelect` prop interface. |
| Backend    | Zero. Server only cares about the submitted number (already validated 0–100). |
| Database   | Zero. |
| Socket     | Zero. `send_number` event payload unchanged. |
| Performance| Positive. 101 DOM buttons → 1 input range element. Significant reduction in render cost on mobile. |

---

### 1.2 Countdown Timer (30s per round)

| Layer      | Impact |
|------------|--------|
| Frontend   | New `useCountdown` hook. Reads `timerDuration` from `gameData`. Displays in GameBoard header. Under 10s: red + pulsing. On expiry: auto-submit (or show expired state). |
| Backend    | `game.js` handler: after emitting `next_round`, start a server-side `setTimeout`. On expiry, evaluate with whoever submitted. Timer ID stored in memory (not Redis — it's ephemeral). Risk: server restart kills timers — acceptable for v1. |
| Database   | Redis: add `timerStartedAt` to game object for reconnect recovery. |
| Socket     | New event: `timer_expired { roomId, round }` → server broadcasts when auto-evaluation fires. Client listens to update UI. |
| Performance| One `setTimeout` per active room. At 1,000 concurrent rooms: 1,000 timers — fine. At 10,000: evaluate moving to a timer service. |

**Timer state machine:**
```
WAITING_FOR_PICKS → TIMER_RUNNING (next_round emitted)
TIMER_RUNNING     → EVALUATING   (all submitted OR timer expired)
EVALUATING        → SHOWING_RESULT (round_result emitted)
SHOWING_RESULT    → WAITING_FOR_PICKS (next_round emitted)
```

---

### 1.3 Round History

| Layer      | Impact |
|------------|--------|
| Frontend   | `RoundHistory` component. State lives in `EightyPercentileRuleContext` — append each `round_result` to a `history[]` array. Display as scrollable table in GameBoard. Reset on `game_reset`. |
| Backend    | `round_result` payload already contains all needed data (submissions, average, target, winnerIds). No backend change needed. |
| Database   | Optional: persist `game.history[]` in Redis room object for reconnect recovery. Adds ~200 bytes per round per room. |
| Socket     | Zero new events. Consumed from existing `round_result`. |
| Performance| Frontend only. Array of max ~20 objects. Negligible. |

---

### 1.4 Waiting Room Chat

| Layer      | Impact |
|------------|--------|
| Frontend   | New `RoomChat.jsx` component in WaitingRoom. Uses own local state for message list. `useEffect` subscribes to `chat_message` socket event. |
| Backend    | New socket handlers: `chat_send` → validates, broadcasts `chat_message` to room. Rate limit: max 1 message/second per socket. Message max length: 200 chars. No persistence — in-memory only. |
| Database   | Zero. Chat is ephemeral — not stored in Redis. If user disconnects and reconnects, history is lost. Acceptable for v1. |
| Socket     | 2 new events: `chat_send { roomId, message }` (client→server), `chat_message { user, message, timestamp }` (server→room). |
| Performance| Each message is a small broadcast. Rate limiting prevents flood. 100 rooms × 10 players × 60 messages/min = 60,000 broadcasts/min — well within Socket.IO capacity. |

**Security note:** Strip HTML, limit length server-side. No markdown parsing. Plain text only.

---

### 1.5 Stepwise Reveal Sequence

| Layer      | Impact |
|------------|--------|
| Frontend   | `RoundResultOverlay.jsx` becomes a multi-step state machine. Steps: [1] Drum roll, [2] Show average, [3] Show target, [4] Reveal picks one by one, [5] Winner(s), [6] Points update. Each step auto-advances after a delay. |
| Backend    | Zero. All data is already in `round_result`. The reveal is a pure frontend animation over existing data. |
| Database   | Zero. |
| Socket     | Zero new events. |
| Performance| CSS animations only. No additional network calls. |

**Frontend state machine for reveal:**
```
IDLE → DRUM_ROLL (1.5s) → SHOW_AVG (1s) → SHOW_TARGET (1s)
     → REVEAL_PICKS (n × 0.6s) → SHOW_WINNER (1.5s)
     → SHOW_POINTS (2s) → DONE (auto-dismiss or user click)
```

---

### 1.6 Emote System

| Layer      | Impact |
|------------|--------|
| Frontend   | `EmoteBar.jsx` — visible after submission, hidden before. Radial button menu on mobile. Players see floating emoji bubbles above opponents' score cards. `emotes` array in context, auto-cleared after 3s. |
| Backend    | New socket handler: `send_emote { roomId, emoteId }` → rate limited (1/2s per socket) → broadcasts `player_emote { socketId, emoteId }` to room. |
| Database   | Zero. Emotes are ephemeral. |
| Socket     | 2 new events: `send_emote`, `player_emote`. |
| Performance| Minimal. Same profile as chat. |

---

### 1.7 Session Stats + Share Screen

| Layer      | Impact |
|------------|--------|
| Frontend   | Stats computed entirely client-side from `history[]` array in context. No backend call. `GameOverScreen.jsx` gains a stats section + "Share Results" button that generates a shareable text/image using `html2canvas` or a plain text template. |
| Backend    | Zero for session stats. If persisting across sessions: requires user identity (Phase 4). |
| Database   | Zero for v1. Phase 4: PostgreSQL `player_stats` table. |
| Socket     | Zero. |
| Performance| `html2canvas` is heavy (~150KB). Load lazily only when "Share" is clicked. |

---

### 1.8 Custom Game Settings (host-configurable)

| Layer      | Impact |
|------------|--------|
| Frontend   | `GameSettingsPanel.jsx` shown to host in WaitingRoom. Fields: timer duration, elimination threshold, duplicate rule toggle, target multiplier. Settings passed in `start_game` socket event. |
| Backend    | `start_game` handler reads settings from payload, merges with defaults, stores in `game.settings` in Redis. All game logic reads from `game.settings` instead of `RULES` constants. `gameRules.js` already uses a `RULES` object — needs to accept per-game overrides. |
| Database   | Redis: `room.game.settings` object added to game state. ~100 extra bytes. |
| Socket     | `start_game` payload extended: `{ roomId, settings: { timerDuration, eliminationThreshold, ... } }` |
| Performance| Zero. Settings are read once per round evaluation. |

---

### 1.9 Landing Page

| Layer      | Impact |
|------------|--------|
| Frontend   | New route `/` that renders a `LandingPage.jsx` component. React Router or simple conditional rendering in `App.jsx` based on `hasStarted` state. Live player count fetched via HTTP REST endpoint (not socket). |
| Backend    | New REST endpoint: `GET /api/stats` → returns `{ activePlayers, activeRooms, gamesToday }`. Reads from Redis key scan. Cached with 10s TTL. |
| Database   | Redis: add `stats:games_today` counter (incremented on game start, reset at midnight via cron). |
| Socket     | Zero for landing page. |
| Performance| Stats endpoint is cached. 1 Redis call per 10s regardless of traffic. |

---

### 1.10 Tutorial Mode (Bot Opponents)

| Layer      | Impact |
|------------|--------|
| Frontend   | Tutorial mode flag passed to game context. Shows tutorial overlays with tips. "Round 1 tip" component. |
| Backend    | New service: `BotPlayer.js`. A simulated player that submits a number after a random delay (2–8s). Bot strategy: random in [20–60] for round 1, then adjust based on previous round's average. Bot has a socketId of format `bot_<uuid>`. Runs entirely server-side. |
| Database   | Tutorial rooms are ephemeral. Stored in Redis like normal rooms but with a `isTutorial: true` flag. Auto-deleted after game ends. |
| Socket     | Tutorial rooms receive same events as normal rooms. Server drives bot submissions internally without a real socket connection. |
| Performance| Tutorial rooms are single-user. Lightweight. |

---

## 2. FEATURE BREAKDOWN

```
EPIC 1: Core Gameplay UX Fixes
│
├── Feature 1.1: Mobile-Responsive Number Input
│   ├── Story: As a mobile player, I need an accurate way to pick a number
│   │   ├── Task: Build NumberSlider.jsx with range input + snap-to-5 option
│   │   ├── Task: Build responsive wrapper: slider on mobile, grid on desktop
│   │   ├── Task: Add large "Lock In" confirm button with double-tap prevention
│   │   └── Task: Preserve keyboard input on desktop (type number + Enter)
│   └── Story: As any player, I need clear feedback that my pick is locked
│       ├── Task: Animate slider to locked state after submission
│       └── Task: Show "Locked: 37" confirmation badge prominently
│
├── Feature 1.2: Countdown Timer
│   ├── Story: As a player, I need time pressure to maintain engagement
│   │   ├── Task: Create useCountdown(duration, onExpire) hook
│   │   ├── Task: Display timer in GameBoard header (circular progress)
│   │   ├── Task: Turn red + pulse under 10s
│   │   └── Task: Handle timer expiry state (show "Time's up!" if not submitted)
│   └── Story: As server, I need to auto-evaluate when timer expires
│       ├── Task: Add setTimeout in game.js after next_round emit
│       ├── Task: Store timerStartedAt in Redis game object
│       ├── Task: On expiry: evaluate with current submissions (even partial)
│       ├── Task: Handle edge case: all submitted before timer → clear timer
│       └── Task: Emit timer_expired event to clients
│
├── Feature 1.3: Round History Panel
│   ├── Story: As a player, I need to see past picks to build strategy
│   │   ├── Task: Add history[] array to EightyPercentileRuleContext
│   │   ├── Task: Append round_result to history on each round
│   │   ├── Task: Build RoundHistory.jsx (scrollable table)
│   │   ├── Task: Mark own picks differently from opponents
│   │   └── Task: Show "VOID" marker for replayed rounds
│   └── Story: As a new player, I need the history to teach me the pattern
│       └── Task: Add progressive tip overlay for rounds 1–2
│
├── Feature 1.4: Danger Zone Visual
│   ├── Story: As a player, I need to feel the tension when near elimination
│   │   ├── Task: Add danger state to PlayerScorePanel (≥ threshold-1 pts)
│   │   ├── Task: Pulsing red border animation on danger player card
│   │   └── Task: "1 point away from elimination" system message in header
│   └── Story: As an observer, I need to see who's about to be eliminated
│       └── Task: Highlight danger players in round history table
│
└── Feature 1.5: Stepwise Reveal
    ├── Story: As a player, I need the result to feel dramatic and earned
    │   ├── Task: Refactor RoundResultOverlay into step-based state machine
    │   ├── Task: Implement steps: drumroll → avg → target → picks → winner → points
    │   ├── Task: Auto-advance timing per step (configurable constants)
    │   └── Task: Allow manual skip (tap to advance)
    └── Story: As a player, I need to see MY pick's distance from target clearly
        └── Task: Show distance indicator per submission in picks step

EPIC 2: Social Layer
│
├── Feature 2.1: Waiting Room Chat
│   ├── Story: As a waiting player, I need something to do while waiting
│   │   ├── Task: Build RoomChat.jsx with message list + input
│   │   ├── Task: Add chat_send socket handler server-side
│   │   ├── Task: Add rate limiter (1 msg/sec per socket)
│   │   ├── Task: Add input sanitization (strip HTML, max 200 chars)
│   │   └── Task: Auto-scroll to latest message
│   └── Story: As a host, I need to see who is engaged vs idle
│       └── Task: Show "typing..." indicator when player is composing
│
├── Feature 2.2: Emote System
│   ├── Story: As a player, I want to react without typing
│   │   ├── Task: Define emote set (6 emotes with IDs)
│   │   ├── Task: Build EmoteBar.jsx (hidden before submit, shown after)
│   │   ├── Task: Add send_emote + player_emote socket events
│   │   ├── Task: Show floating bubble above player card in score panel
│   │   └── Task: Auto-clear emote after 3 seconds
│   └── Story: As a player, I want emotes as strategic bluffing tools
│       └── Task: Emotes visible to ALL players (including opponents) during waiting phase
│
└── Feature 2.3: Host Controls
    ├── Story: As a room creator, I need control over who starts the game
    │   ├── Task: Store hostSocketId in room object on room creation
    │   ├── Task: Send isHost flag in room_update to the host client
    │   ├── Task: Hide "Start Game" button for non-hosts in private rooms
    │   └── Task: Transfer host to next player on host disconnect
    └── Story: As a host, I want to configure game settings before starting
        ├── Task: Build GameSettingsPanel.jsx in WaitingRoom
        ├── Task: Extend start_game payload with settings object
        └── Task: Validate settings server-side (ranges, types)

EPIC 3: Onboarding + Discovery
│
├── Feature 3.1: Landing Page
│   ├── Story: As a visitor, I need to understand the game in 8 seconds
│   │   ├── Task: Build LandingPage.jsx with hero, rules summary, CTA
│   │   ├── Task: Add GET /api/stats REST endpoint
│   │   ├── Task: Display live player count with polling (10s interval)
│   │   └── Task: Implement conditional routing in App.jsx
│   └── Story: As a returning player, I need immediate re-entry
│       └── Task: Show "Welcome back, 🧠 Prajwal" if localStorage has user
│
├── Feature 3.2: Tutorial Mode
│   ├── Story: As a new player, I need to learn the game without stakes
│   │   ├── Task: Build BotPlayer service (server-side)
│   │   ├── Task: Create tutorial room type in roomManager
│   │   ├── Task: Build progressive tip overlay system (3 rounds)
│   │   └── Task: Tutorial room auto-starts with 2 bots
│   └── Story: As a tutorial player, I need explanation after each result
│       └── Task: Build TutorialResultExplainer.jsx (round-specific tips)
│
└── Feature 3.3: Game Code System
    ├── Story: As a host, I want a shareable code (not just a URL)
    │   ├── Task: Generate 6-char alphanumeric game code on room creation
    │   ├── Task: Add code → roomId mapping in Redis (with TTL)
    │   ├── Task: Add GET /api/room/:code REST endpoint for lookup
    │   └── Task: Show code prominently in WaitingRoom
    └── Story: As a player, I want to join by typing a code
        └── Task: Add code input field on Room Choice screen

EPIC 4: Session Stats + Sharing
│
├── Feature 4.1: Session Stats
│   ├── Story: As a player, I want to see my performance after a game
│   │   ├── Task: Compute stats from history[] in GameOverScreen
│   │   ├── Task: Stats: wins, avg pick, closest-to-target round, accuracy
│   │   └── Task: Display "Personalized title" based on stats heuristics
│   └── Story: As a player, I want to compare my stats to opponents
│       └── Task: Show all players' stats side-by-side in game over
│
└── Feature 4.2: Share Results
    ├── Story: As a winner, I want to share proof of my win
    │   ├── Task: Generate shareable text summary (plain text, no deps)
    │   ├── Task: Build "Copy Results" button (writes to clipboard)
    │   └── Task: Optional: html2canvas snapshot of results card
    └── Story: As any player, I want to recruit friends to play
        └── Task: Include invite link in share text automatically

EPIC 5: Sound + Animation
│
├── Feature 5.1: Sound Design
│   ├── Story: As a player, I want audio feedback for key moments
│   │   ├── Task: Add sound manager service (Web Audio API, no deps)
│   │   ├── Task: Define sound events: submit, reveal, win, eliminate, void
│   │   ├── Task: Add global mute toggle (persisted in localStorage)
│   │   └── Task: All sounds lazy-loaded on first interaction
│   └── Story: As a player, I need sound to be off by default (accessibility)
│       └── Task: Muted by default. First interaction prompts "Enable sounds?"
│
└── Feature 5.2: Animation System
    ├── Story: As a player, I need visual juice on every action
    │   ├── Task: Submission lock animation (number bounces + fades grid)
    │   ├── Task: Penalty point fill animation (dot pulses red when added)
    │   ├── Task: Elimination screen (full-screen flash moment)
    │   ├── Task: Winner confetti on game over
    │   └── Task: Round void spinning animation
    └── Story: As a developer, animations must not block gameplay
        └── Task: All animations CSS-only (no JS animation loops)
```

---

## 3. DATABASE CHANGES

### 3.1 Redis — Current Structure

```
room:{roomId}  →  {
  id, type, users[], game: {
    round, numbers{}, points{}, eliminatedPlayers[],
    submittedCount, status, turnOrder[], settings{},
    average, target, winnerIds[], winnerSocketId
  }
}
```

### 3.2 Redis — New Structures Required

**Room object additions:**
```
room:{roomId}  →  {
  ...existing...
  hostSocketId: string,           // NEW: host tracking
  settings: {                     // NEW: custom game config
    timerDuration: 30,
    eliminationThreshold: 5,
    targetMultiplier: 0.8,
    duplicateRuleEnabled: true,
    maxPlayers: 8
  },
  code: string,                   // NEW: 6-char join code
  isTutorial: boolean,            // NEW: tutorial room flag
  game: {
    ...existing...
    timerStartedAt: timestamp,    // NEW: timer recovery
    history: [                    // NEW: round history
      {
        round, average, target,
        winnerIds[], submissions[],
        invalidSubmissions[],
        exactMatch, roundVoid
      }
    ]
  }
}
```

**New Redis keys:**

```
code:{CODE}  →  roomId   (TTL: 4 hours)
  Purpose: Game code → room ID lookup
  Example: code:MIND42  →  "abc123"
  Size: ~30 bytes per entry

stats:games_today  →  integer (counter)
  Purpose: Landing page "games played today"
  Reset: Daily cron or TTL-based date key

stats:players_online  →  integer (counter)
  Purpose: Approximate connected player count
  Maintained: increment on socket connect, decrement on disconnect
  Note: Can drift — use with tolerance

timer:{roomId}  →  { round, expiresAt }  (TTL: timerDuration + 5s)
  Purpose: Allow client reconnect to sync timer state
  Size: ~60 bytes per room
```

**New Redis indexes (simulated via key naming):**
```
public:rooms  →  SET of room IDs that are public + joinable
  Instead of scanning room:* keys on every join_room (O(N) scan),
  maintain a SET of joinable public room IDs.
  Add on: room created as public
  Remove on: room full, game started, room deleted
  This reduces getPublicRooms() from O(N) scan to O(1) SRANDMEMBER
```

### 3.3 Phase 4: PostgreSQL (Persistence Layer)

Only needed for XP, levels, achievements, cross-session stats. Not required for Phases 1–3.

```sql
-- Users (session-persisted via device fingerprint or cookie)
users (
  id          UUID PRIMARY KEY,
  display_name VARCHAR(20),
  avatar      VARCHAR(10),
  created_at  TIMESTAMP,
  last_seen   TIMESTAMP
)

-- Game sessions (one per completed game)
game_sessions (
  id          UUID PRIMARY KEY,
  room_id     VARCHAR(20),
  started_at  TIMESTAMP,
  ended_at    TIMESTAMP,
  player_count INT,
  rounds_played INT,
  winner_id   UUID REFERENCES users(id)
)

-- Player stats per session
session_stats (
  id              UUID PRIMARY KEY,
  game_session_id UUID REFERENCES game_sessions(id),
  user_id         UUID REFERENCES users(id),
  final_points    INT,
  rounds_won      INT,
  avg_pick        DECIMAL(5,2),
  placement       INT,          -- 1st, 2nd, 3rd...
  was_eliminated  BOOLEAN,
  eliminated_round INT
)

-- Indexes
CREATE INDEX idx_session_stats_user ON session_stats(user_id);
CREATE INDEX idx_game_sessions_started ON game_sessions(started_at);
```

---

## 4. SOCKET EVENT DESIGN

### Complete event catalog (current + new)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ EVENT NAME           │ DIRECTION          │ PAYLOAD                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ EXISTING EVENTS                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ join_room            │ client → server    │ { roomId, user, roomType }       │
│ leave_room           │ client → server    │ callback                         │
│ start_game           │ client → server    │ { roomId, settings? }  EXTENDED  │
│ send_number          │ client → server    │ { roomId, user, no }             │
│ restart_game         │ client → server    │ { roomId }                       │
│ room_update          │ server → room      │ room object                      │
│ game_started         │ server → room      │ —                                │
│ next_round           │ server → room      │ { round, points, turnOrder,      │
│                      │                    │   eliminatedPlayers, timerDuration│
│                      │                    │   hostSocketId }        EXTENDED  │
│ waiting_for_players  │ server → room      │ { submitted, total }             │
│ round_result         │ server → room      │ full result object               │
│ round_void           │ server → room      │ { round, reason, submissions }   │
│ player_eliminated    │ server → room      │ { socketId }                     │
│ game_over            │ server → room      │ { winnerSocketId, points, reason}│
│ game_reset           │ server → room      │ —                                │
│ number_received      │ server → client    │ { no }                           │
│ not_in_room          │ server → client    │ —                                │
│ duplicate_submission │ server → client    │ { message }                      │
│ invalid_number       │ server → client    │ { message }                      │
│ round_already_completed│ server → client  │ —                                │
│ error_message        │ server → client    │ { message }                      │
│ disconnect           │ client → server    │ (built-in)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ NEW EVENTS — PHASE 1                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ timer_tick           │ server → room      │ { roomId, round, secondsLeft }   │
│   Purpose: Sync timer across clients                                         │
│   Emit: Every 5s during round (not every second — reduces traffic)          │
│   Failure: Client uses local countdown, server tick corrects drift          │
│                                                                              │
│ timer_expired        │ server → room      │ { roomId, round }                │
│   Purpose: Notify clients that auto-evaluation fired                        │
│   Emitter: game.js setTimeout handler                                       │
│   Consumer: EightyPercentileRuleContext → show "Time's up!" state           │
├─────────────────────────────────────────────────────────────────────────────┤
│ NEW EVENTS — PHASE 2                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ chat_send            │ client → server    │ { roomId, message }              │
│   Validation: message.length ≤ 200, strip HTML                              │
│   Rate limit: 1/second per socket (in-memory counter)                      │
│   Failure: emit chat_error { message: "Too fast" } back to sender           │
│                                                                              │
│ chat_message         │ server → room      │ { socketId, name, avatar,        │
│                      │                    │   message, timestamp }           │
│   Purpose: Broadcast validated message to all room members                  │
│                                                                              │
│ send_emote           │ client → server    │ { roomId, emoteId }              │
│   Validation: emoteId in [0..5], rate limit 1/2s per socket                │
│   Failure: silently drop invalid emotes                                     │
│                                                                              │
│ player_emote         │ server → room      │ { socketId, emoteId }            │
│   Purpose: Show floating bubble above sender's card for all players         │
│                                                                              │
│ typing_start         │ client → server    │ { roomId }                       │
│ typing_stop          │ client → server    │ { roomId }                       │
│ player_typing        │ server → room      │ { socketId, isTyping }           │
│   Purpose: "Alice is typing..." in chat                                     │
│   Rate limit: throttle server broadcast to 1/sec per socket                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ NEW EVENTS — PHASE 3                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ settings_update      │ server → room      │ { settings }                     │
│   Purpose: When host changes settings, all clients see the update           │
│                                                                              │
│ host_changed         │ server → room      │ { newHostSocketId }              │
│   Purpose: Broadcast when host disconnects and host transfers               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Timer sync strategy

Do NOT emit a tick every second (creates 30 broadcasts per round per room).

```
Strategy: Client-authoritative with server correction

1. Server emits next_round with { timerDuration: 30, serverTime: Date.now() }
2. Client starts local countdown from timerDuration
3. Server emits timer_tick every 10s with { secondsLeft }
4. Client corrects its countdown to serverTime if drift > 1s
5. On timer_expired, server does the evaluation regardless of client state
6. Client shows "Time's up!" overlay
```

---

## 5. FRONTEND CHANGES

### 5.1 New Folder Structure

```
client/src/
│
├── components/
│   ├── game/                         ← NEW grouping
│   │   ├── GameBoard.jsx             (existing, refactored)
│   │   ├── NumberSlider.jsx          (NEW — mobile input)
│   │   ├── NumberGrid.jsx            (existing — desktop input)
│   │   ├── NumberInput.jsx           (NEW — responsive wrapper)
│   │   ├── PlayerScorePanel.jsx      (existing, enhanced)
│   │   ├── RoundHistory.jsx          (NEW)
│   │   ├── CountdownTimer.jsx        (NEW)
│   │   └── EmoteBar.jsx              (NEW)
│   │
│   ├── reveal/                       ← NEW
│   │   ├── RoundResultReveal.jsx     (replaces RoundResultOverlay)
│   │   ├── RevealStep.jsx            (each step component)
│   │   └── VoidRoundReveal.jsx       (extracted from overlay)
│   │
│   ├── lobby/                        ← NEW grouping
│   │   ├── WaitingRoom.jsx           (existing, enhanced)
│   │   ├── RoomChat.jsx              (NEW)
│   │   ├── PlayerList.jsx            (extracted from WaitingRoom)
│   │   └── GameSettingsPanel.jsx     (NEW — host only)
│   │
│   ├── onboarding/                   ← NEW
│   │   ├── LandingPage.jsx           (NEW)
│   │   ├── HowToPlay.jsx             (NEW)
│   │   └── TutorialOverlay.jsx       (NEW)
│   │
│   ├── end/                          ← NEW grouping
│   │   ├── GameOverScreen.jsx        (existing, enhanced)
│   │   ├── SessionStats.jsx          (NEW)
│   │   └── ShareResults.jsx          (NEW)
│   │
│   ├── shared/                       ← NEW
│   │   ├── FloatingAlert.jsx         (moved from modals/)
│   │   ├── AvatarChip.jsx            (NEW — reusable player display)
│   │   ├── PenaltyDots.jsx           (NEW — score visualization)
│   │   └── Modal.jsx                 (NEW — generic modal wrapper)
│   │
│   ├── Login.jsx                     (existing, enhanced)
│   ├── RoomTypeOverlay.jsx           (existing → move to lobby/)
│   └── GameOverScreen.jsx            (existing → move to end/)
│
├── contexts/
│   ├── UserContext.jsx               (existing)
│   ├── GameContext.jsx               (existing)
│   ├── EightyPercentileRuleContext.jsx (existing, enhanced)
│   ├── ChatContext.jsx               (NEW)
│   └── SoundContext.jsx              (NEW)
│
├── hooks/                            ← NEW directory
│   ├── useCountdown.js               (NEW)
│   ├── useEmotes.js                  (NEW)
│   ├── useRoundHistory.js            (NEW)
│   ├── useSessionStats.js            (NEW)
│   └── useSound.js                   (NEW)
│
├── services/                         ← NEW directory
│   ├── soundManager.js               (NEW — Web Audio API)
│   ├── shareService.js               (NEW — clipboard + html2canvas)
│   └── api.js                        (NEW — REST calls: stats, room lookup)
│
├── constants/
│   └── constants.jsx                 (existing, add EMOTES, SOUND_EVENTS)
│
├── assets/
│   ├── bg.png                        (existing)
│   └── sounds/                       (NEW — small audio files)
│       ├── submit.mp3
│       ├── reveal.mp3
│       ├── win.mp3
│       ├── eliminate.mp3
│       └── tick.mp3
│
├── App.jsx                           (existing, add routing logic)
├── index.jsx                         (existing)
├── index.css                         (existing, add new keyframes)
└── socket.jsx                        (existing)
```

### 5.2 Context Changes

**EightyPercentileRuleContext** — additions:
```
+ history[]              Array of past round results
+ roundVoidHistory[]     Array of void rounds (separate from scored rounds)
+ timerDuration          From next_round payload
+ timerStartedAt         Local timestamp when next_round received
+ emotes{}               { socketId: emoteId } — current active emotes
```

**New: ChatContext** (isolated to avoid re-renders in game components):
```
messages[]           { socketId, name, avatar, message, timestamp }
typingPlayers[]      [socketId] currently typing
sendMessage(text)    Emits chat_send
```

**New: SoundContext:**
```
isMuted              boolean (localStorage persisted)
toggleMute()
play(soundEvent)     Plays a sound by event name
```

### 5.3 Key Hooks

**useCountdown(duration, serverTime, onExpire):**
```
- Initializes countdown from serverTime offset
- Updates every 100ms using requestAnimationFrame
- Returns { secondsLeft, isExpired, isWarning (< 10s) }
- Corrects drift on timer_tick events
- Calls onExpire when reaches 0
```

**useRoundHistory():**
```
- Subscribes to round_result and round_void events
- Returns history[] array
- Computes: personalAvgPick, roundsWon, personalAccuracy
- Resets on game_reset
```

**useSessionStats(history, players, user):**
```
- Pure computation over history array
- Returns: wins, avgPick, bestRound, worstRound, personalTitle
- personalTitle heuristic: most wins → "Mind Reader", avg pick < 35 → "Anchor", etc.
```

### 5.4 Component State Responsibilities

```
EightyPercentileRuleContext  ← game-critical shared state (round, void, results)
ChatContext                  ← isolated chat state
SoundContext                 ← isolated audio state
GameBoard                    ← orchestrates game layout only
RoundResultReveal            ← owns reveal step progression state
CountdownTimer               ← owns local timer state (synced from context)
NumberInput                  ← owns selected/locked state locally
EmoteBar                     ← reads emotes from context, owns animation state
```

---

## 6. BACKEND CHANGES

### 6.1 New Folder Structure

```
server/
│
├── socketHandlers/
│   ├── game.js               (existing, enhanced)
│   ├── lobby.js              (existing, enhanced)
│   ├── chat.js               (NEW — chat_send, typing events)
│   └── emote.js              (NEW — send_emote handler)
│
├── services/                 ← NEW directory
│   ├── timerService.js       (NEW — manages per-room countdown timers)
│   ├── botService.js         (NEW — tutorial bot logic)
│   ├── statsService.js       (NEW — maintains stats:* Redis keys)
│   └── codeService.js        (NEW — game code generation + lookup)
│
├── utils/
│   ├── gameRules.js          (existing)
│   ├── gameManager.js        (existing, enhanced)
│   ├── roomManager.js        (existing, enhanced — add publicRooms SET)
│   └── rateLimiter.js        (NEW — in-memory per-socket rate limiting)
│
├── routes/                   ← NEW directory
│   ├── stats.js              (NEW — GET /api/stats)
│   └── room.js               (NEW — GET /api/room/:code)
│
├── constants/
│   └── constants.js          (existing)
│
├── middleware/               ← NEW directory
│   └── socketMiddleware.js   (NEW — socket auth + rate limiting)
│
├── redisClient.js            (existing)
└── server.js                 (existing, add REST routes + middleware)
```

### 6.2 Service Descriptions

**timerService.js:**
```
- Maintains Map<roomId, { timerId, round }>
- startTimer(io, roomId, game, activePlayers, duration)
  → Sets setTimeout
  → On expiry: calls evaluateRound with partial submissions, emits result
  → Clears self from map
- clearTimer(roomId)
  → Called when all players submit before expiry
- getTimeLeft(roomId) → number (for reconnect)
```

**rateLimiter.js:**
```
- In-memory Map<socketId, { count, resetAt }>
- isAllowed(socketId, action, maxPerWindow, windowMs) → boolean
- Used by: chat (1/1s), emote (1/2s), send_number (1/round — separate logic)
- Memory: bounded by active socket count. Cleared on disconnect.
```

**codeService.js:**
```
- generateCode() → 6-char alphanumeric (e.g. "MIND42")
- Collision check: try Redis GET before accepting
- storeCode(code, roomId, ttlSeconds)
- lookupCode(code) → roomId | null
- revokeCode(code) → delete Redis key
```

**statsService.js:**
```
- incrementGamesToday() → INCR stats:games_today
- getStats() → { gamesPlayed, activePlayers }
- activePlayers tracked via socket connect/disconnect
- Cached: 10s TTL on computed response
```

### 6.3 Socket Handler Changes

**game.js additions:**
```
- start_game: merge custom settings, store in game.settings, start timer
- send_number: on all submitted → clearTimer before evaluating
- After next_round emit → timerService.startTimer(...)
- After round_result emit → append to game.history[] in Redis
```

**New: chat.js:**
```
- chat_send handler:
  1. Rate limit check (rateLimiter.isAllowed)
  2. Validate room membership
  3. Sanitize message
  4. Broadcast chat_message to room
- typing_start / typing_stop → debounced broadcast player_typing
```

**New: emote.js:**
```
- send_emote handler:
  1. Rate limit check
  2. Validate emoteId in range
  3. Broadcast player_emote to room
```

**lobby.js additions:**
```
- join_room: 
  - Generate code on room creation
  - Set hostSocketId if first user
  - Add to public:rooms SET if public
  - Increment stats:players_online
- disconnect:
  - If disconnected is host → transfer to next user → emit host_changed
  - Remove from public:rooms SET if room deleted
  - Decrement stats:players_online
```

### 6.4 REST API Design

```
GET /api/stats
  Response: { activePlayers: int, gamesPlayedToday: int, activeRooms: int }
  Cache: 10s
  Auth: None
  Use: Landing page live counters

GET /api/room/:code
  Response: { roomId: string, playerCount: int, isStarted: boolean }
           | { error: "Room not found" } (404)
  Cache: None (must be real-time)
  Auth: None
  Use: "Join by code" feature

GET /api/health
  Response: { status: "ok", redis: "ok", timestamp: ISO }
  Use: Docker health check, uptime monitoring
```

### 6.5 Server.js Changes

```
1. Add Express JSON middleware
2. Register REST routes: app.use('/api', statsRouter), app.use('/api', roomRouter)
3. Register socket middleware: io.use(socketMiddleware)
4. Initialize timerService with io reference
5. Register new socket handler files: handleChatEvents, handleEmoteEvents
```

---

## 7. SCALABILITY REVIEW

### Baseline: Current Architecture

```
1 VPS → 1 Node process → Socket.IO in-memory + Redis
```

This is fine for < 1,000 concurrent users. Above that, it needs horizontal scaling.

---

### 7.1 — 100 Concurrent Users (~15–20 active rooms)

**Current architecture handles this easily.**

Bottlenecks: None at this scale.
Redis operations: ~500/min (room reads/writes during active games).
Socket.IO memory: ~5MB for 100 active connections.
Node CPU: <5% on any modern VPS.

**Action required:** None. Deploy as-is.

---

### 7.2 — 1,000 Concurrent Users (~150–200 active rooms)

**Current architecture still works, but cracks appear.**

**Problem 1: `redis.keys('room:*')` in getPublicRooms()**
This is an O(N) full key scan. At 200 rooms it's fast; at 2,000 rooms it blocks Redis.

**Fix:** Replace with a Redis SET `public:rooms` containing joinable room IDs.
- `SADD public:rooms roomId` when public room is created
- `SREM public:rooms roomId` when room fills, game starts, or room is deleted
- `SRANDMEMBER public:rooms 1` to find a room (O(1))

**Problem 2: Timer service memory**
200 concurrent timers in a Node.js Map → still fine (~10KB).

**Problem 3: Single Node process**
1,000 WebSocket connections on one process is comfortable (Node handles 10,000+ easily).

**Action required:**
- Fix `public:rooms` SET (critical)
- Add Redis connection pooling
- Monitor with PM2 or similar process manager

---

### 7.3 — 10,000 Concurrent Users (~1,500 active rooms)

**Current architecture breaks. Horizontal scaling required.**

**Problem 1: Multiple Node processes can't share timers**
If you run 3 Node instances behind a load balancer, a timer set on instance A fires on instance A — but the socket connections for that room might be on instance B or C.

**Fix:** Redis-based timer with Socket.IO adapter.
- Use `socket.io-redis` adapter (now `@socket.io/redis-adapter`)
- All Socket.IO events broadcast through Redis pub/sub
- Timers → use `Bull` or `BullMQ` Redis-based job queue
- Timer expiry jobs are claimed by any worker instance

**Problem 2: Single Redis instance is a SPOF**
At 10,000 users: ~50,000 Redis ops/min.

**Fix:** Redis Sentinel (managed failover) or Redis Cluster (horizontal sharding).
Estimated throughput requirement: 50,000 ops/min = ~833 ops/sec — within single Redis limits (100,000+ ops/sec), but need HA for uptime.

**Problem 3: Node.js CPU for evaluation**
evaluateRound() is synchronous but O(N) for N players — trivial. Not a bottleneck.

**Architecture at 10,000 users:**
```
Internet → Nginx (load balancer)
           ↓              ↓
      Node Instance 1  Node Instance 2  (N instances)
           ↓              ↓
      Redis Cluster (pub/sub adapter for Socket.IO)
           ↓
      Redis Sentinel (HA)
           ↓
      PostgreSQL (for persistent stats, Phase 4 only)
```

**Action required:**
- Add `@socket.io/redis-adapter`
- Replace in-memory timers with BullMQ jobs
- Add Redis Sentinel or managed Redis (Upstash, Redis Cloud)
- Containerize with Docker Compose → move to Kubernetes or Docker Swarm
- Add Nginx with sticky sessions (or use Redis adapter to avoid need for sticky)

---

## 8. SECURITY REVIEW

### 8.1 Cheating Possibilities

**Cheat 1: Viewing others' submissions before everyone submits**
- Risk: A player intercepts WebSocket traffic to see what others picked before submitting.
- Current state: Submissions are stored in `game.numbers` in Redis immediately on receipt. If someone reads Redis, they can see picks.
- Fix: Store picks encrypted or hashed in Redis. Reveal only at evaluation. **Or** simply: the server never tells any client what others picked until all are in. The current architecture already does this — `round_result` only fires after all submit. But a malicious user with Redis access can read raw data.
- Severity: **Low** (requires Redis access — i.e., server compromise)

**Cheat 2: Submitting after seeing others' picks via timing**
- Risk: Player submits last, knowing they can't see others. But they could measure the time between others' "number_received" events and estimate their picks psychologically.
- Current state: Players only receive `waiting_for_players { submitted: N, total: M }` — no info about WHO submitted or what they picked.
- Fix: Current design is already safe. Don't reveal who submitted.
- Severity: **None** (by design)

**Cheat 3: Submitting multiple numbers**
- Current state: Prevented by `game.numbers[socket.id] !== undefined` check.
- Risk: Player disconnects and reconnects to get a new socket.id, then submits again.
- Fix: Track submissions by **user name** (or a session token) not socket.id. On reconnect, restore the player's previous socketId association.
- Severity: **Medium** — currently exploitable

**Cheat 4: Spoofing another player's identity**
- Risk: Client sends `send_number { user: { name: "Bob" } }` — with Bob's name.
- Current state: Server validates `room.users.some(u => u.socketId === socket.id)` — so the cheat doesn't work because it checks socket.id, not user.name. **This is correctly implemented.**
- Severity: **None** (already fixed)

**Cheat 5: Socket flooding / DDoS**
- Risk: Malicious client sends thousands of events per second.
- Current state: No rate limiting on `send_number` or `join_room`.
- Fix: rateLimiter.js (planned for Phase 2). Also: Socket.IO's built-in ping/pong disconnects unresponsive clients.
- Severity: **High** — currently unmitigated

**Cheat 6: Host abuse**
- Risk: Host starts game with only themselves, or repeatedly restarts to avoid elimination.
- Fix: Validate `socket.id === room.hostSocketId` on `start_game`. Validate minimum players server-side (already done). Add cooldown on `restart_game` (30s between restarts).
- Severity: **Medium**

**Cheat 7: Score manipulation via Redux/React DevTools**
- Risk: Player modifies client-side state to show false scores.
- Current state: Scores are server-authoritative. Client state is display-only. `round_result` is the source of truth.
- Fix: None needed. Score shown on all clients is from server.
- Severity: **None** (by design — server-authoritative)

**Cheat 8: Fake room creation to inflate stats**
- Risk: Bot creates thousands of rooms to inflate `stats:games_today`.
- Fix: Rate limit `join_room` per IP (add Express `express-rate-limit` for REST + socket connection rate limiting). CAPTCHA not appropriate for a game.
- Severity: **Low** (cosmetic only — doesn't affect game integrity)

### 8.2 Input Validation Gaps (current)

```
Gap 1: start_game — no validation that roomId exists before creating game
  Fix: Return error if room not found (already partially done — check result)

Gap 2: send_number — user.name not validated against room member names
  Fix: Don't trust user object from client. Look up user by socket.id only.

Gap 3: chat_send — no profanity filtering
  Fix: Basic word filter or allow it (moderation is a v2 concern)

Gap 4: restart_game — any player can restart, not just host
  Fix: Validate hostSocketId on restart_game

Gap 5: Room settings — client-supplied settings not range-validated
  Fix: Clamp all settings server-side in start_game handler
```

### 8.3 Security Checklist

```
✅ Scores are server-authoritative
✅ Players identified by socket.id (not client-supplied name)
✅ Submissions deduplicated per socket per round
✅ Numbers clamped 0–100 server-side
✅ HTML stripped from player names
✅ Player names capped at 20 chars
✅ Private room validates creator flag
✅ Redis TTL on all room data

❌ No rate limiting on socket events (add Phase 1)
❌ No host validation on start_game / restart_game (add Phase 1)
❌ Reconnect allows re-submission with new socket.id (add Phase 2)
❌ No validation that game.settings values are in valid ranges (add Phase 1)
❌ stats:* counters have no abuse protection (acceptable for v1)
```

---

## 9. MIGRATION PLAN

### Phase 1: Core UX Fixes — Critical Path
**Goal:** Fix every broken experience that blocks retention.  
**Duration:** 3–4 days  
**Risk:** Low — mostly frontend, minimal backend

```
1. Mobile number input (NumberSlider.jsx)
   → Zero backend change. Ship in 4 hours.

2. Countdown timer (client + server)
   → Add timerService.js. Extend next_round payload.
   → Add timer_expired socket event.
   → Test: timer expiry with partial submissions.

3. Round history panel (RoundHistory.jsx)
   → Accumulate from existing round_result events.
   → Zero backend change.

4. Danger zone visual (PlayerScorePanel enhancement)
   → CSS only. Zero backend change.

5. Security gaps: rate limiting + host validation
   → Add rateLimiter.js
   → Validate hostSocketId on start_game + restart_game
   → Clamp game settings server-side

6. Fix Redis public rooms scan → SET
   → Replace keys() scan with SADD/SREM/SRANDMEMBER
   → Critical for performance above 200 rooms

7. Extend next_round payload
   → Add timerDuration, hostSocketId

Deployment: Blue-green deploy. No migration needed (Redis keys compatible).
Rollback: Revert Docker image. No data migration required.
```

---

### Phase 2: Social Layer + Onboarding
**Goal:** Reduce lobby abandonment. Convert first-time visitors.  
**Duration:** 5–7 days  
**Risk:** Medium — new socket events, chat handler

```
1. Landing page + /api/stats endpoint
   → Build LandingPage.jsx
   → Add statsService + REST route
   → Test: stat counters accurate

2. Waiting room chat
   → Add chat.js socket handler
   → Build RoomChat.jsx
   → Rate limiter integration
   → Test: flood resistance, HTML injection

3. Emote system
   → Add emote.js handler
   → Build EmoteBar.jsx
   → Test: emote rate limiting, animation cleanup

4. Host controls (host-only start, settings panel)
   → Add hostSocketId to room object
   → Build GameSettingsPanel.jsx
   → Validate settings server-side

5. Stepwise reveal sequence
   → Refactor RoundResultOverlay into step machine
   → Test: each step fires correctly, manual skip works

6. Game code system
   → Add codeService.js
   → Add /api/room/:code REST endpoint
   → Show code in WaitingRoom

Deployment: Rolling deploy. Add new Redis keys (backward compatible).
Rollback: Safe — new features are additive.
```

---

### Phase 3: Engagement + Polish
**Goal:** Make the game memorable and shareable.  
**Duration:** 7–10 days  
**Risk:** Medium — sound system, animations, tutorial bots

```
1. Sound design system
   → Add soundManager.js (Web Audio API)
   → Add SoundContext
   → Integrate at 5 key moments
   → Default muted. "Enable sounds?" prompt on first interaction.
   → Test: does not autoplay before user gesture

2. Animation system
   → Submission lock animation
   → Penalty dot fill animation
   → Elimination screen flash
   → Game over confetti
   → All CSS keyframes — no JS animation lib

3. Session stats + share results
   → Build SessionStats.jsx (computed from history[])
   → Build ShareResults.jsx (clipboard + optional html2canvas)
   → Build personalized title generator
   → Test: share text correct, html2canvas loads lazily

4. Tutorial mode (basic bots)
   → Build botService.js (2 bots: random strategy)
   → Create tutorial room type
   → Build TutorialOverlay.jsx (3-round tips)
   → Test: bots submit valid numbers, tutorial completes correctly

5. 2-player dueling screen
   → Distinct GameBoard layout when activePlayers.length === 2
   → Show cycle rule prominently
   → Quick-pick buttons for 0, 1, 100

6. Progressive onboarding tooltips
   → Round 1 tip: "The target will be lower than the average"
   → Round 2 post-result: "You picked X. Target was Y. Difference: Z"
   → Dismiss after round 3

Deployment: Rolling deploy. No schema changes.
Rollback: Safe — all additive.
```

---

### Phase 4: Platform + Scale
**Goal:** Long-term retention, scalability, cross-device persistence.  
**Duration:** 10–14 days  
**Risk:** High — new infrastructure, database, identity system

```
1. PostgreSQL schema + migration
   → Add users, game_sessions, session_stats tables
   → Write migration scripts
   → Use Prisma or Drizzle ORM

2. Device identity (no account)
   → Generate UUID on first visit, store in localStorage + cookie
   → Associate UUID with game sessions
   → Link UUID to PostgreSQL user record

3. Cross-session stats
   → After game ends, write to session_stats in PostgreSQL
   → Build stats API endpoint
   → Build player profile view

4. XP + levels
   → Define XP formula (wins, rounds played, accuracy)
   → Add xp + level to users table
   → Show level badge in avatar chip

5. Achievements system
   → Define achievement criteria
   → Check after each round_result + game_over
   → Store in achievements table
   → Toast notification on unlock

6. Horizontal scaling
   → Add @socket.io/redis-adapter
   → Replace in-memory timers with BullMQ
   → Add Redis Sentinel or managed Redis
   → Docker Compose → Kubernetes manifests

7. Weekly leaderboard
   → PostgreSQL materialized view or aggregation query
   → Displayed on landing page
   → Reset every Monday

Deployment: Requires database migration. Zero-downtime with expand-contract pattern.
Rollback: Complex — requires DB rollback scripts.
```

---

## 10. IMPLEMENTATION ORDER SUMMARY

```
Priority | Feature                          | Phase | Effort | Impact
─────────────────────────────────────────────────────────────────────────────
P0       | Mobile slider input              | 1     | 4h     | Fixes mobile entirely
P0       | Security: rate limit + host auth | 1     | 4h     | Prevents abuse
P0       | Redis public rooms SET           | 1     | 2h     | Scales to 1000+ rooms
P1       | Countdown timer                  | 1     | 8h     | Core tension mechanic
P1       | Round history                    | 1     | 4h     | Strategy enabler
P1       | Danger zone visual               | 1     | 2h     | Emotional engagement
P1       | Stepwise reveal                  | 2     | 8h     | #1 fun moment
P2       | Waiting room chat                | 2     | 6h     | Lobby retention
P2       | Landing page                     | 2     | 6h     | Visitor conversion
P2       | Host controls + settings         | 2     | 6h     | Game control
P2       | Emotes                           | 2     | 4h     | Social layer
P2       | Game code system                 | 2     | 4h     | Shareability
P3       | Session stats + share            | 3     | 8h     | Viral growth
P3       | Sound design                     | 3     | 6h     | Emotional juice
P3       | Animations                       | 3     | 10h    | Polish
P3       | Tutorial mode                    | 3     | 12h    | New player retention
P3       | 2-player duel screen             | 3     | 4h     | Endgame drama
P4       | PostgreSQL + persistence         | 4     | 16h    | Long-term retention
P4       | XP + achievements                | 4     | 12h    | Gamification
P4       | Horizontal scaling               | 4     | 16h    | Growth infrastructure
P4       | Weekly leaderboard               | 4     | 8h     | Competition
```

---

*End of Technical Implementation Plan*  
*Phase 1 start → ship in 1 week. Phase 4 complete → 6–8 weeks.*
