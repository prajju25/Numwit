# Proposal: "Play vs Computer" Mode

Status: Proposal (not yet implemented)
Author: UX/PM pass, paired with engineering feasibility notes
Related: BOT_FILL_FEATURE_DESIGN.md (public-room auto-fill — already implemented)

## 0. Summary

Public-room auto-fill (BOT_FILL_FEATURE_DESIGN.md) solves "I queued for a public
match and nobody showed up." It does not solve a different, equally common
need: **"I want to practice / play right now, by myself, against bots — on
purpose."**

This proposal adds a third, explicit entry point — **Play vs Computer** —
alongside Public Room and Private Room. It is a deliberate solo mode, not a
fallback. Picking it always means "give me bots," with no waiting room and no
countdown.

It reuses the bot infrastructure built for auto-fill (`botService.js`,
`BOT_NAMES`/`BOT_AVATARS`, bot socketIds, "🤖 Bot" badges) but is architecturally
separate: a new `roomType` value, not a flag on public/private rooms.

## 1. Why a third mode instead of extending public/private

| Option | Verdict |
|---|---|
| A. Auto-fill empty public rooms with bots | ✅ Already shipped — solves the "matchmaking timeout" case, but the user has to wait `BOT_FILL_DELAY_MS` and it only triggers when matchmaking happens to come up empty. Not a reliable "play now" button. |
| B. Let hosts fill private rooms with bots | ❌ Rejected (see BOT_FILL_FEATURE_DESIGN.md §0/§3). Private rooms are for friends; bots there are confusing and dilute the "this is a private game with people I invited" expectation. |
| C. New "Play vs Computer" mode (this proposal) | ✅ Gives users an explicit, instant, zero-wait way to play bots whenever they want — independent of matchmaking and without touching the private-room contract. |

## 2. UX Flow

### 2.1 Entry point

`RoomTypeOverlay` ("Choose Room Type") gains a third option:

```
🌍 Public Room   🔒 Private Room   🤖 Play vs Computer
```

Selecting "Play vs Computer" skips the waiting room entirely:

1. User taps "🤖 Play vs Computer".
2. Client emits `join_room` with `roomType: "solo"`.
3. Server creates a brand-new room, immediately fills it with bots up to
   `MIN_PLAYERS`, and starts the game in the same request — no
   `room_update` "waiting for players" state is ever shown.
4. User lands directly on the `GameBoard`, same as the moment a normal game
   starts.

No countdown banner, no "Looking for players…" — the whole point is zero wait.

### 2.2 In-game

Identical to any bot-containing game today:
- Bot rows show the "🤖 Bot" badge (`WaitingRoom`/`PlayerScorePanel` — already
  implemented).
- Bots submit numbers via `botService.scheduleBotSubmissions` /
  `getBotNumber`, same as auto-filled public games.
- `persistGameOver` already skips bots (`if (!deviceId) continue`), so XP/stats
  are recorded correctly for the human player only.

### 2.3 Post-game

"Play Again" / "Back to Lobby" behave as today. "Play Again" from a solo game
re-emits `join_room` with `roomType: "solo"`, creating a fresh solo room (old
one is torn down via the existing `cleanupIfBotsOnly` — a solo room is *always*
bots-only once the human leaves, so it's deleted immediately on disconnect/leave).

### 2.4 Optional (future, not in this proposal's MVP)

- Let the user pick number of bot opponents (1–`MAX_PLAYERS - 1`) before
  starting.
- Difficulty presets that tune `getBotNumber`'s spread.
- Rename label to "Practice Mode" if user research suggests that framing tests
  better than "Play vs Computer."

These are explicitly **out of scope** for the MVP described here — MVP always
fills to `MIN_PLAYERS` using the existing bot heuristic, no configuration UI.

## 3. Data model / API implications

### 3.1 `roomType` — new value, not a new field

`roomType` is already a free-form string passed from client to server
(`"public"` | `"private"`). This proposal adds a third accepted value:
`"solo"`.

- `room.type = "solo"` is stored exactly like `"public"`/`"private"` today —
  `roomManager.addUserToRoom` already does `room.type = roomType` generically
  (server/utils/roomManager.js:46). **No schema change.**
- `addUserToRoom`'s public-room-matching logic (`getPublicRooms`,
  `getRoomsByType("public")`) only triggers on `roomType === "public"`, so
  `"solo"` rooms are naturally never matched into or listed — each
  "Play vs Computer" click creates its own isolated room, which is what we
  want.
- Old clients that don't know about `"solo"` are unaffected: they never send
  it, and if a server ever received an unrecognized `roomType` from a stale
  client it already falls through to "create a new room" — same as today.

### 3.2 No new persistent DB fields

Solo rooms use the exact same `room.users` bot entries
(`{ socketId: "bot-<roomId>-<n>", name, avatar, isBot: true }`) as auto-fill.
`persistGameOver`/`statsService`/`achievementService` already ignore
no-`deviceId` users. **No Prisma migration needed.**

### 3.3 `join_room` handler changes (server)

New branch in `lobby.js`'s `join_room`, parallel to the existing
`isNewPublicRoom` branch:

```js
if (roomType === "solo") {
  // Always a brand-new, single-occupant room — never matched, never reused.
  roomNo = Math.random().toString(36).substring(2, 8);
  socket.join(roomNo);
  user.socketId = socket.id;
  var room = await addUserToRoom(roomNo, user, "solo", true);

  // Fill immediately — no timer, no countdown.
  var addedBots = botService.fillRoomWithBots(room, MIN_PLAYERS);
  await saveRoom(room);

  io.to(roomNo).emit("room_update", room);
  if (addedBots.length > 0) {
    io.to(roomNo).emit("bots_added", { roomId: roomNo, bots: addedBots });
  }

  await startGameForRoom(io, roomNo, {});
  return;
}
```

This reuses `botService.fillRoomWithBots` and `startGameForRoom` verbatim —
no changes to either. `botService.scheduleBotFill`/`BOT_FILL_DELAY_MS` are
**not** used for solo rooms (no countdown).

### 3.4 Client changes

- `RoomTypeOverlay.jsx`: add the third button, `handleRoomSelection("solo")`.
- `UserContext`: `roomType` already accepts an arbitrary string — no type
  change needed, just allow `"solo"` through.
- `WaitingRoom.jsx`: a solo room's first `room_update` already has `room.game`
  set (game started server-side before the first emit), so the existing
  "`if (room.game) → game_in_progress` snapshot" path
  (lobby.js:70-87, already implemented for mid-game joiners) naturally routes
  the solo player straight to `GameBoard` without any new client branching.
  Net new client logic is limited to the overlay button.

## 4. Backward compatibility

| Area | Before | After | Status |
|---|---|---|---|
| Public rooms | unaffected | unaffected | ✅ |
| Private rooms | unaffected | unaffected — still never see bots | ✅ |
| `roomType` field | `"public"` \| `"private"` | `"public"` \| `"private"` \| `"solo"` | ✅ additive enum value |
| DB schema | — | — | ✅ no migration |
| New socket events | — | — | ✅ none — reuses `join_room`, `room_update`, `bots_added`, `game_in_progress` |
| Old clients | — | never send `roomType: "solo"`, so never hit the new branch | ✅ |

## 5. Test cases (high-level, to be expanded if approved)

| ID | Scenario | Expected result |
|---|---|---|
| TC-SOLO-001 | User selects "Play vs Computer" | `join_room` emitted with `roomType: "solo"`; server creates a new room, fills to `MIN_PLAYERS` with bots, starts the game in one round trip |
| TC-SOLO-002 | Solo game in progress | bot rows show "🤖 Bot" badge; bots submit numbers within 1-4s per round via existing `scheduleBotSubmissions` |
| TC-SOLO-003 | Human leaves/disconnects from a solo room | `cleanupIfBotsOnly` detects bots-only room and tears it down immediately (same as auto-filled public rooms) |
| TC-SOLO-004 | `persistGameOver` after a solo game | only the human player's stats/XP/achievements are written (bots have no `deviceId`) |
| TC-SOLO-005 | "Play Again" from a finished solo game | re-emits `join_room` with `roomType: "solo"`; creates a fresh solo room, old one already cleaned up |
| TC-SOLO-006 | Public/private room flows | unchanged — `roomType: "solo"` path is fully isolated in `join_room` |

## 6. Open questions for PM/design sign-off

1. Final label/copy: "Play vs Computer" vs "Practice Mode" vs "Solo Play"?
2. MVP always uses `MIN_PLAYERS` (3) total seats (1 human + 2 bots) — is that
   the right default, or should solo games default to a different bot count?
3. Should solo games be excluded from any leaderboards/matchmaking stats
   beyond what `persistGameOver`'s `deviceId` guard already handles?
4. Do we want a distinct visual treatment (e.g. a small "Practice" tag in the
   game header) so users always know they're not in a ranked/social match?

## 7. Relationship to existing bot-fill feature

| | Public auto-fill (shipped) | Play vs Computer (this proposal) |
|---|---|---|
| Trigger | Implicit — matchmaking timeout | Explicit — user picks it |
| Wait | `BOT_FILL_DELAY_MS` (15s) countdown | None — instant |
| Room type | `"public"` | new `"solo"` |
| Shared code | `botService.fillRoomWithBots`, `scheduleBotSubmissions`, `getBotNumber`, bot badges | same |
| Not shared | `scheduleBotFill`/`botFillAt` (no countdown for solo) | n/a |
