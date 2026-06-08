# 80 Percentile — Complete Development Plan

> **Game Rule:** Each round, players submit a number 0–100. The winner is whoever is closest to **80% of the average** of all submissions. First player to accumulate **5 penalty points** is eliminated. Last player standing wins.

---

## Current State Summary

| Layer | Done | Pending |
|---|---|---|
| Login UI | ✅ | — |
| Room join/create (public & private) | ✅ | — |
| Waiting room UI | ✅ | — |
| Redis room management | ✅ | — |
| Game start trigger | ✅ | — |
| `send_number` server handler | 🚧 stub | full logic |
| Round evaluation & scoring | ❌ | everything |
| GameBoard UI (live game) | ❌ | everything |
| Special rules | ❌ | everything |
| Game over / restart | ❌ | everything |

---

## Phase 1 — Server: Core Round Logic
**Goal:** Make `send_number` fully functional — collect numbers, evaluate the round, broadcast results.

### 1.1 Fix the Redis key bug
**File:** `server/utils/roomManager.js`

`getRoomById` uses key `room:${roomId}` directly but `getRoomKey()` also produces `room:${roomId}` — they are consistent. However, `addUserToRoom` uses `getRoomKey` while `getRoomById` hardcodes the prefix. Consolidate to one helper.

```js
// Change getRoomById to use getRoomKey:
const getRoomById = async (roomId) => {
  const key = getRoomKey(roomId);
  const roomData = await redis.get(key);
  return roomData ? JSON.parse(roomData) : null;
};

// Add a saveRoom helper (used everywhere):
async function saveRoom(room) {
  const key = getRoomKey(room.id);
  await redis.set(key, JSON.stringify(room));
  return room;
}

module.exports = { ..., getRoomById, saveRoom };
```

---

### 1.2 Add round state to `createGameData`
**File:** `server/utils/gameManager.js`

Expand the game data structure:

```js
async function createGameData(room) {
  if (!room.game) {
    const gameData = {
      round: 1,
      totalRounds: 3,           // configurable
      numbers: {},              // { socketId: number }
      points: {},               // { socketId: cumulativePoints }
      turnOrder: shuffleArray(room.users.map(u => u.socketId)), // random for round 1
      status: GAME_80_PERCENTILE_STATUS.IN_PROGRESS,
      average: null,
      target: null,
      winnerSocketId: null,
      eliminatedPlayers: [],    // [socketId, ...]
      submittedCount: 0,
    };

    room.users.forEach(u => (gameData.points[u.socketId] = 0));
    room.game = gameData;
    await saveRoom(room);
    return gameData;
  }
  return null;
}

// Helper
function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
```

---

### 1.3 Build the full `send_number` handler
**File:** `server/socketHandlers/game.js`

This is the most critical piece. Replace the stub with:

```js
const { getRoomById } = require("../utils/roomManager");
const { saveRoom } = require("../utils/roomManager");
const { evaluateRound } = require("../utils/gameManager");
const { GAME_80_PERCENTILE_STATUS } = require("../constants/constants");

socket.on("send_number", async ({ roomId, user, no }) => {
  // 1. Validate range
  if (no < 0 || no > 100) {
    return socket.emit("invalid_number", { message: "Number must be 0–100" });
  }

  const room = await getRoomById(roomId);
  if (!room || !room.game) return socket.emit("not_in_room");

  const game = room.game;

  // 2. Reject if already submitted this round
  if (game.numbers[socket.id] !== undefined) {
    return socket.emit("duplicate_submission", { message: "Already submitted" });
  }

  // 3. Reject if round is already evaluated
  if (game.status === GAME_80_PERCENTILE_STATUS.COMPLETED) {
    return socket.emit("round_already_completed");
  }

  // 4. Store submission
  game.numbers[socket.id] = no;
  game.submittedCount++;
  socket.emit("number_received", { no });

  const activePlayers = room.users.filter(
    u => !game.eliminatedPlayers.includes(u.socketId)
  );

  // 5. Check if all active players submitted
  if (game.submittedCount < activePlayers.length) {
    io.to(roomId).emit("waiting_for_players", {
      submitted: game.submittedCount,
      total: activePlayers.length,
    });
    await saveRoom(room);
    return;
  }

  // 6. All submitted — evaluate the round
  const result = evaluateRound(game, activePlayers);
  Object.assign(game, result.updatedGame);
  await saveRoom(room);

  // 7. Broadcast result events
  if (result.exactMatch) {
    io.to(roomId).emit("exact_match_penalty", result);
  } else if (result.tieBreaker) {
    io.to(roomId).emit("tie_breaker_three_players", result);
  } else if (activePlayers.length === 2) {
    io.to(roomId).emit("two_players_left_result", result);
  }

  io.to(roomId).emit("round_result", result);

  // 8. Check eliminations
  result.newlyEliminated.forEach(socketId => {
    io.to(roomId).emit("player_eliminated", { socketId });
  });

  // 9. Check game over
  const remainingPlayers = activePlayers.filter(
    u => !game.eliminatedPlayers.includes(u.socketId)
  );
  if (remainingPlayers.length === 1) {
    io.to(roomId).emit("game_over", {
      winnerSocketId: remainingPlayers[0].socketId,
      points: game.points,
    });
    return;
  }

  // 10. Advance to next round
  game.round++;
  game.numbers = {};
  game.submittedCount = 0;
  game.status = GAME_80_PERCENTILE_STATUS.IN_PROGRESS;
  await saveRoom(room);

  io.to(roomId).emit("next_round", {
    round: game.round,
    points: game.points,
    turnOrder: game.turnOrder,
    eliminatedPlayers: game.eliminatedPlayers,
  });
});
```

---

### 1.4 Build `evaluateRound` utility
**File:** `server/utils/gameManager.js`

```js
function evaluateRound(game, activePlayers) {
  const submissions = activePlayers.map(u => ({
    socketId: u.socketId,
    number: game.numbers[u.socketId],
  }));

  const sum = submissions.reduce((acc, s) => acc + s.number, 0);
  const average = sum / submissions.length;
  const target = average * 0.8;

  // Find closest to target
  let minDiff = Infinity;
  let winnerSocketId = null;
  submissions.forEach(s => {
    const diff = Math.abs(s.number - target);
    if (diff < minDiff) {
      minDiff = diff;
      winnerSocketId = s.socketId;
    }
  });

  // Detect special cases
  const exactMatch = submissions.some(s => s.number === target);
  const grouped = {};
  submissions.forEach(s => {
    grouped[s.number] = (grouped[s.number] || []);
    grouped[s.number].push(s.socketId);
  });
  const tieBreaker = activePlayers.length === 3 &&
    Object.values(grouped).some(g => g.length === 3);

  // Two players: 0 vs 100 — 100 wins
  let twoPlayerOverride = false;
  if (activePlayers.length === 2) {
    const nums = submissions.map(s => s.number).sort((a, b) => a - b);
    if (nums[0] === 0 && nums[1] === 100) {
      winnerSocketId = submissions.find(s => s.number === 100).socketId;
      twoPlayerOverride = true;
    }
  }

  // Apply points — losers get +1 (or +2 if exact match)
  const updatedPoints = { ...game.points };
  const penalty = exactMatch ? 2 : 1;
  submissions.forEach(s => {
    if (s.socketId !== winnerSocketId) {
      updatedPoints[s.socketId] = (updatedPoints[s.socketId] || 0) + penalty;
    }
  });

  // Check new eliminations (5 points = out)
  const ELIMINATION_THRESHOLD = 5;
  const newlyEliminated = [];
  const eliminatedPlayers = [...game.eliminatedPlayers];
  Object.entries(updatedPoints).forEach(([socketId, pts]) => {
    if (pts >= ELIMINATION_THRESHOLD && !eliminatedPlayers.includes(socketId)) {
      newlyEliminated.push(socketId);
      eliminatedPlayers.push(socketId);
    }
  });

  return {
    round: game.round,
    average,
    target,
    winnerSocketId,
    submissions,
    points: updatedPoints,
    exactMatch,
    tieBreaker,
    twoPlayerOverride,
    newlyEliminated,
    updatedGame: {
      average,
      target,
      winnerSocketId,
      points: updatedPoints,
      eliminatedPlayers,
      status: GAME_80_PERCENTILE_STATUS.COMPLETED,
    },
  };
}
```

---

### 1.5 Add restart handler
**File:** `server/socketHandlers/game.js`

```js
socket.on("restart_game", async ({ roomId }) => {
  const room = await getRoomById(roomId);
  if (!room) return;

  room.game = null; // wipe game state
  await saveRoom(room);

  const gameData = await createGameData(room);
  io.to(roomId).emit("game_reset", gameData);
  io.to(roomId).emit("next_round", gameData);
});
```

---

### 1.6 Add `ELIMINATION_THRESHOLD` and `MIN_PLAYERS` to constants
**File:** `server/constants/constants.js`

```js
const ROOM_PREFIX = "room:";
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 3;
const ELIMINATION_THRESHOLD = 5;
const TOTAL_ROUNDS_DEFAULT = 3;

const GAME_80_PERCENTILE_STATUS = {
  WAIT: "WAIT",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
};

module.exports = {
  ROOM_PREFIX,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ELIMINATION_THRESHOLD,
  TOTAL_ROUNDS_DEFAULT,
  GAME_80_PERCENTILE_STATUS,
};
```

---

## Phase 2 — Client: GameBoard (Live Game UI)
**Goal:** Replace the bare number grid with a full, reactive game screen.

### 2.1 Expand `EightyPercentileRuleContext`
**File:** `client/src/contexts/EightyPercentileRuleContext.jsx`

Add listeners for all game events:

```jsx
export const EightyPercentileRuleProvider = ({ children }) => {
  const [gameData, setGameData] = useState({});
  const [roundResult, setRoundResult] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [waitingCount, setWaitingCount] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [eliminatedPlayers, setEliminatedPlayers] = useState([]);

  useEffect(() => {
    socket.on("next_round", (data) => {
      setGameData(data);
      setRoundResult(null);
      setSubmitted(false);
      setWaitingCount(null);
    });

    socket.on("waiting_for_players", ({ submitted, total }) => {
      setWaitingCount({ submitted, total });
    });

    socket.on("round_result", (result) => {
      setRoundResult(result);
      setWaitingCount(null);
    });

    socket.on("player_eliminated", ({ socketId }) => {
      setEliminatedPlayers(prev => [...prev, socketId]);
    });

    socket.on("game_over", (data) => {
      setGameOver(data);
    });

    socket.on("game_reset", () => {
      setRoundResult(null);
      setSubmitted(false);
      setGameOver(null);
      setEliminatedPlayers([]);
    });

    return () => {
      socket.off("next_round");
      socket.off("waiting_for_players");
      socket.off("round_result");
      socket.off("player_eliminated");
      socket.off("game_over");
      socket.off("game_reset");
    };
  }, []);

  return (
    <EightyPercentileRuleContext.Provider value={{
      gameData, roundResult, submitted, setSubmitted,
      waitingCount, gameOver, eliminatedPlayers
    }}>
      {children}
    </EightyPercentileRuleContext.Provider>
  );
};

export const useEightyPercentile = () => useContext(EightyPercentileRuleContext);
```

---

### 2.2 Rebuild GameBoard component
**File:** `client/src/components/GameBoard.jsx`

Split into sub-sections:

```
GameBoard/
  ├── GameBoard.jsx          — main orchestrator
  ├── NumberGrid.jsx         — 0–100 button grid
  ├── PlayerScorePanel.jsx   — live scoreboard
  ├── RoundResultOverlay.jsx — modal shown after round ends
  └── GameOverScreen.jsx     — final winner screen
```

**GameBoard.jsx** (main):
```jsx
import React from "react";
import { useEightyPercentile } from "../contexts/EightyPercentileRuleContext";
import { useGame } from "../contexts/GameContext";
import { useUser } from "../contexts/UserContext";
import socket from "../socket";
import NumberGrid from "./NumberGrid";
import PlayerScorePanel from "./PlayerScorePanel";
import RoundResultOverlay from "./RoundResultOverlay";
import GameOverScreen from "./GameOverScreen";

function GameBoard() {
  const { roomId, user } = useUser();
  const { players } = useGame();
  const {
    gameData, roundResult, submitted, setSubmitted,
    waitingCount, gameOver
  } = useEightyPercentile();

  if (gameOver) return <GameOverScreen data={gameOver} players={players} />;

  const handleNumberClick = (no) => {
    if (submitted) return;
    socket.emit("send_number", { roomId, user, no });
    setSubmitted(true);
  };

  return (
    <div className="w-full max-w-3xl bg-white p-6 rounded-xl shadow space-y-4">
      {/* Round Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Round {gameData.round}</h2>
        <span className="text-sm text-gray-500">
          {submitted ? "⏳ Waiting for others..." : "🎯 Pick your number"}
        </span>
      </div>

      {/* Waiting indicator */}
      {waitingCount && (
        <p className="text-sm text-indigo-600">
          {waitingCount.submitted}/{waitingCount.total} players submitted
        </p>
      )}

      <div className="flex gap-6">
        <PlayerScorePanel players={players} points={gameData.points} />
        <NumberGrid onSelect={handleNumberClick} disabled={submitted} />
      </div>

      {/* Round result overlay */}
      {roundResult && <RoundResultOverlay result={roundResult} players={players} />}
    </div>
  );
}
export default GameBoard;
```

**NumberGrid.jsx**:
```jsx
function NumberGrid({ onSelect, disabled }) {
  return (
    <div className="flex-1">
      <button
        disabled={disabled}
        onClick={() => onSelect(0)}
        className="mb-2 px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-40"
      >0</button>
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 100 }, (_, i) => (
          <button
            key={i + 1}
            disabled={disabled}
            onClick={() => onSelect(i + 1)}
            className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition"
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
```

**PlayerScorePanel.jsx**:
```jsx
function PlayerScorePanel({ players, points, eliminatedPlayers }) {
  return (
    <div className="w-40 shrink-0">
      <h3 className="font-semibold text-sm text-gray-600 mb-2">Scores</h3>
      <ul className="space-y-2">
        {players?.map(p => {
          const isEliminated = eliminatedPlayers?.includes(p.socketId);
          return (
            <li key={p.socketId}
              className={`flex justify-between text-sm ${isEliminated ? "opacity-40 line-through" : ""}`}
            >
              <span>{p.avatar} {p.name}</span>
              <span className="font-bold text-red-500">
                {points?.[p.socketId] ?? 0} pts
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

**RoundResultOverlay.jsx**:
```jsx
function RoundResultOverlay({ result, players }) {
  const winner = players?.find(p => p.socketId === result.winnerSocketId);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-sm w-full space-y-3">
        <h2 className="text-2xl font-bold">Round {result.round} Result</h2>
        <p>Average: <strong>{result.average?.toFixed(2)}</strong></p>
        <p>Target (80%): <strong>{result.target?.toFixed(2)}</strong></p>
        {result.exactMatch && (
          <p className="text-red-500 font-semibold">⚡ Exact match! All others +2 pts</p>
        )}
        <p className="text-green-600 text-xl">
          🏆 Winner: {winner?.avatar} {winner?.name}
        </p>
        <div className="text-left text-sm mt-2">
          {result.submissions?.map(s => {
            const player = players?.find(p => p.socketId === s.socketId);
            return (
              <div key={s.socketId} className="flex justify-between py-1 border-b">
                <span>{player?.avatar} {player?.name}</span>
                <span className="font-mono">{s.number}</span>
              </div>
            );
          })}
        </div>
        {result.newlyEliminated?.length > 0 && (
          <p className="text-red-600 font-semibold">
            ☠️ Eliminated: {result.newlyEliminated.map(id => {
              const p = players?.find(pl => pl.socketId === id);
              return `${p?.avatar} ${p?.name}`;
            }).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
```

**GameOverScreen.jsx**:
```jsx
import socket from "../socket";
import { useUser } from "../contexts/UserContext";

function GameOverScreen({ data, players }) {
  const { roomId } = useUser();
  const winner = players?.find(p => p.socketId === data.winnerSocketId);

  const handleRestart = () => {
    socket.emit("restart_game", { roomId });
  };

  return (
    <div className="flex flex-col items-center justify-center text-center space-y-6 p-8">
      <h1 className="text-4xl font-bold">🎉 Game Over!</h1>
      <p className="text-2xl">Winner: {winner?.avatar} {winner?.name}</p>
      <div className="text-left">
        <h3 className="font-semibold mb-2">Final Scores:</h3>
        {players?.map(p => (
          <div key={p.socketId} className="flex justify-between gap-8">
            <span>{p.avatar} {p.name}</span>
            <span className="font-bold">{data.points?.[p.socketId] ?? 0} pts</span>
          </div>
        ))}
      </div>
      <button
        onClick={handleRestart}
        className="bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700"
      >
        🔄 Play Again
      </button>
    </div>
  );
}
```

---

## Phase 3 — Error Handling & Edge Cases
**Goal:** Make the game robust against disconnects, rejoins, and invalid states.

### 3.1 Handle mid-game disconnect
**File:** `server/socketHandlers/lobby.js`

When a player disconnects mid-game, auto-submit a default number for them (e.g. 50) OR skip them. Recommended: skip/remove them from active players.

```js
socket.on("disconnect", async () => {
  const room = await removeUserFromRoom(socket.id);
  if (room) {
    io.to(room.id).emit("room_update", room);

    // If game is in progress, check if remaining players can continue
    if (room.game) {
      const activePlayers = room.users.filter(
        u => !room.game.eliminatedPlayers.includes(u.socketId)
      );
      if (activePlayers.length < 2) {
        io.to(room.id).emit("game_over", {
          winnerSocketId: activePlayers[0]?.socketId,
          points: room.game.points,
          reason: "opponent_disconnected",
        });
      }
    }
  }
});
```

### 3.2 Validate player is active before accepting submission
**File:** `server/socketHandlers/game.js`

```js
// At the top of send_number handler, after getting room:
const isActive = !game.eliminatedPlayers.includes(socket.id);
const isInRoom = room.users.some(u => u.socketId === socket.id);
if (!isInRoom) return socket.emit("not_in_room");
if (!isActive) return; // silently ignore eliminated player submissions
```

### 3.3 Client: Show error toasts for socket errors
**File:** `client/src/components/GameBoard.jsx`

Listen for `invalid_number`, `duplicate_submission`, `not_in_room`, `round_already_completed` and show a `FloatingAlert`.

---

## Phase 4 — UX Polish
**Goal:** Make the game feel alive and fun.

### 4.1 Submission feedback
- After clicking a number, highlight it in green and disable the rest
- Show a pulsing "Waiting for X more players..." message

### 4.2 Turn order display
- Show which player's "turn" it conceptually is (since this is simultaneous, frame it as who submitted last round)
- Highlight the round 1 randomized order in the score panel

### 4.3 Countdown timer (optional)
**File:** `server/socketHandlers/game.js`

Add a 30-second auto-evaluation timer. If not all players submit within 30s, evaluate with submitted numbers only:

```js
// After emitting next_round:
const timer = setTimeout(async () => {
  const freshRoom = await getRoomById(roomId);
  const game = freshRoom.game;
  // If still waiting (status IN_PROGRESS and not all submitted)
  if (game.submittedCount < activePlayers.length && game.submittedCount > 0) {
    // Evaluate with whoever submitted
    const partialPlayers = activePlayers.filter(
      u => game.numbers[u.socketId] !== undefined
    );
    // ... run evaluation with partialPlayers
  }
}, 30000);
// Store timer ref and clear it when all submit
```

### 4.4 Animations
- Fade-in for round result overlay (Tailwind `animate-fadeIn`)
- Slide-in for eliminated player notification
- Confetti or emoji burst for game over winner

### 4.5 Invite link UX improvement
Show a "Copied!" toast when copying room link in WaitingRoom.

---

## Phase 5 — Infrastructure & Production Hardening

### 5.1 Environment variables
**File:** `server/.env`

```
PORT=5000
REDIS_URL=redis://localhost:6379
```

**File:** `server/redisClient.js` — ensure it reads `REDIS_URL`:
```js
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
```

### 5.2 Redis TTL on rooms
Prevent stale rooms from accumulating:
```js
// In saveRoom():
await redis.set(key, JSON.stringify(room), "EX", 3600); // 1 hour TTL
```

### 5.3 Docker-compose wiring
Verify `docker-compose.yml` links server to Redis container by hostname. The server's `REDIS_URL` should be `redis://redis:6379` inside Docker.

### 5.4 Rate limiting
Add `express-rate-limit` to prevent socket flood attacks. Alternatively, track submission timestamps per socket and reject if too frequent.

### 5.5 Input sanitization
- Clamp submitted number server-side: `Math.max(0, Math.min(100, Math.round(no)))`
- Sanitize player name on join: strip HTML, limit to 20 chars

---

## Phase 6 — Testing

### 6.1 Unit tests for game logic
**File:** `server/utils/gameManager.test.js`

Test `evaluateRound` with:
- Normal case: 3 players, varied numbers
- Exact match case
- 3-player tie-breaker
- 2-player 0 vs 100
- Elimination threshold crossing

```bash
npm install --save-dev jest
```

### 6.2 Integration tests for socket events
**File:** `server/tests/game.integration.test.js`

Use `socket.io-client` in test to simulate 3 players joining, starting game, submitting numbers, and verify `round_result` shape.

### 6.3 Client component tests
Use React Testing Library to test:
- `Login` form validation
- `WaitingRoom` start button enable/disable logic
- `GameOverScreen` renders correct winner

---

## Recommended Build Order

```
Phase 1 (Server logic)     ← Do this first, nothing else works without it
  └── 1.1 Fix Redis key bug
  └── 1.2 Expand game data structure
  └── 1.3 Full send_number handler
  └── 1.4 evaluateRound utility
  └── 1.5 restart_game handler
  └── 1.6 Update constants

Phase 2 (Client UI)        ← Build after Phase 1 so you can test end-to-end
  └── 2.1 Expand EightyPercentileRuleContext
  └── 2.2 Rebuild GameBoard with sub-components

Phase 3 (Edge cases)       ← Wire after basic flow works
Phase 4 (UX Polish)        ← Last, once core game loop is solid
Phase 5 (Infrastructure)   ← Can run in parallel with Phase 4
Phase 6 (Testing)          ← Ongoing, write tests as you build Phase 1 & 2
```

---

## File Change Summary

| File | Action |
|---|---|
| `server/constants/constants.js` | Add `MIN_PLAYERS`, `ELIMINATION_THRESHOLD`, `TOTAL_ROUNDS_DEFAULT` |
| `server/utils/roomManager.js` | Fix `getRoomById`, add `saveRoom` helper |
| `server/utils/gameManager.js` | Expand `createGameData`, add `evaluateRound`, `shuffleArray` |
| `server/socketHandlers/game.js` | Full `send_number` + `restart_game` handlers |
| `server/socketHandlers/lobby.js` | Mid-game disconnect handling |
| `client/src/contexts/EightyPercentileRuleContext.jsx` | Add all socket event listeners + state |
| `client/src/components/GameBoard.jsx` | Full rebuild with sub-components |
| `client/src/components/NumberGrid.jsx` | **New file** |
| `client/src/components/PlayerScorePanel.jsx` | **New file** |
| `client/src/components/RoundResultOverlay.jsx` | **New file** |
| `client/src/components/GameOverScreen.jsx` | **New file** |
| `server/.env` | Add `REDIS_URL` |
| `server/redisClient.js` | Use env var for Redis URL + add TTL |
