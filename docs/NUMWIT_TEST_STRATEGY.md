# Numwit — Complete Testing Strategy
> Senior QA Architect · SDET · Security Tester · Performance Engineer  
> Application: **Numwit** — Real-time multiplayer browser game  
> Stack: React + Socket.IO + Node.js + Redis + PostgreSQL + WebRTC

---

## Table of Contents
1. [Functional Test Cases](#1-functional-test-cases)
2. [Unit Test Cases with Code](#2-unit-test-cases-with-code)
3. [API Test Cases](#3-api-test-cases)
4. [Security Test Cases](#4-security-test-cases)
5. [Performance Test Cases](#5-performance-test-cases)
6. [Database Test Cases](#6-database-test-cases)
7. [Frontend Test Cases](#7-frontend-test-cases)
8. [Integration Tests](#8-integration-tests)
9. [Regression Suite](#9-regression-suite)
10. [Automation Scripts](#10-automation-scripts)
11. [Edge Cases Catalogue](#11-edge-cases-catalogue)
12. [Bug Hunting — Likely Defects](#12-bug-hunting--likely-defects)
13. [Risk Matrix](#13-risk-matrix)
14. [Test Coverage Matrix](#14-test-coverage-matrix)

---

## 1. Functional Test Cases

### Module 1: Device Identity & Session Management

| TC-ID | Module | Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Type |
|-------|--------|----------|---------------|------------|-----------|-----------------|----------|----------|------|
| TC-001 | Identity | First-time visitor gets device ID | Clear localStorage | 1. Open app 2. Inspect localStorage | None | `80p-device-id` key created with valid UUIDv4 | P0 | Critical | Positive |
| TC-002 | Identity | Device ID persists on refresh | TC-001 done | 1. Note device ID 2. Hard-refresh 3. Re-inspect | Stored UUID | Same UUID present | P0 | Critical | Positive |
| TC-003 | Identity | Device ID persists across tabs | TC-001 done | 1. Open new tab 2. Inspect localStorage | Stored UUID | Same UUID in new tab | P1 | High | Positive |
| TC-004 | Identity | User profile stored after name entry | Fresh app | 1. Enter name "Alice" 2. Select avatar 3. Click Play | `name: Alice, avatar: 🐱` | `80Percentile-user` JSON in localStorage | P0 | Critical | Positive |
| TC-005 | Identity | Profile persists on page reload | TC-004 done | 1. Reload page | Stored profile | Login screen skipped, user restored | P0 | Critical | Positive |
| TC-006 | Identity | Corrupt localStorage JSON handled | Manually corrupt JSON | 1. Open app | `{invalid json}` in localStorage key | App loads without crash, shows login | P1 | High | Negative |
| TC-007 | Identity | localStorage disabled (private mode) | Disable storage in browser | 1. Open app 2. Enter name | Name, avatar | App still works with null deviceId | P2 | Medium | Negative |
| TC-008 | Session | Disconnect event resets app state | Joined room | 1. Kill server 2. Observe client | Socket disconnect | App returns to login screen | P0 | Critical | Positive |
| TC-009 | Session | Socket reconnect after brief drop | In game | 1. Disable network 3s 2. Re-enable | — | Socket reconnects, game state restored | P1 | High | Positive |

### Module 2: Room Management

| TC-ID | Module | Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Type |
|-------|--------|----------|---------------|------------|-----------|-----------------|----------|----------|------|
| TC-010 | Room | Create private room | User logged in | 1. Click "Create Room" | roomType=private | Room created, user in WaitingRoom, invite link shown | P0 | Critical | Positive |
| TC-011 | Room | Join private room via invite link | Room exists | 1. Navigate to `/:roomId` | Valid roomId | User joins, WaitingRoom shown, player list updated | P0 | Critical | Positive |
| TC-012 | Room | Join via 6-char room code | Room exists, code generated | 1. Enter room code 2. Click Join | Valid 6-char code | Resolved to roomId, joined | P0 | Critical | Positive |
| TC-013 | Room | Join public room (matchmaking) | No private room | 1. Click "Play Public" | roomType=public | Placed in available room or new one created | P1 | High | Positive |
| TC-014 | Room | Host badge shown correctly | 2 players in room | 1. Both players see WaitingRoom | hostSocketId matches | Crown badge on host, no crown on other | P0 | Critical | Positive |
| TC-015 | Room | Host can change game settings | User is host | 1. Change timer to 60s 2. Toggle duplicate rule | timerDuration=60 | Settings persisted, shown in panel | P1 | High | Positive |
| TC-016 | Room | Non-host cannot start game | User is non-host | 1. Intercept start_game emit | roomId, settings | Server rejects: "Only the host can start" | P0 | Critical | Negative |
| TC-017 | Room | Start disabled with 1 player | 1 player in room | 1. Observe Start button | minPlayers=2 | Start button disabled, counter shows remaining | P0 | Critical | Positive |
| TC-018 | Room | Start enabled at min players | 2+ players | 1. Observe Start button | minPlayers=2 met | Button active and clickable | P0 | Critical | Positive |
| TC-019 | Room | Player leaves mid-wait | 3 players in room | 1. Player 3 closes tab | — | Player removed from list, host maintained | P1 | High | Positive |
| TC-020 | Room | Invalid room code rejected | — | 1. Enter `XXXXXX` | Non-existent code | API 404, error shown to user | P1 | High | Negative |
| TC-021 | Room | Copy invite link button works | Private room | 1. Click Copy Invite | — | Link in clipboard, "✅ Link Copied!" shown briefly | P2 | Low | Positive |

### Module 3: Game Flow

| TC-ID | Module | Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Type |
|-------|--------|----------|---------------|------------|-----------|-----------------|----------|----------|------|
| TC-022 | Game | Round 1 starts correctly | 2+ players, host clicks Start | 1. Host clicks Start | — | All clients receive next_round, round=1, timer starts | P0 | Critical | Positive |
| TC-023 | Game | Round number displays correctly | Round 1 active | 1. View header | gameData.round=1 | "Round 1" displayed (not "Round —") | P0 | Critical | Positive |
| TC-024 | Game | Player submits number in range | Round active | 1. Click number 42 | no=42 | `number_received` ack, "Submitted: 42" shown | P0 | Critical | Positive |
| TC-025 | Game | Number 0 submittable | Round active | 1. Click 0 | no=0 | Accepted, submitted state shown | P0 | Critical | Positive |
| TC-026 | Game | Number 100 submittable | Round active | 1. Click 100 | no=100 | Accepted, submitted state shown | P0 | Critical | Positive |
| TC-027 | Game | Duplicate submission blocked | Already submitted | 1. Try submit again | no=50 | `duplicate_submission` error alert shown | P0 | Critical | Negative |
| TC-028 | Game | Waiting indicator shows count | 2/3 players submitted | 1. Observe while 1 player hasn't | submitted=2, total=3 | "⏳ Waiting — 2/3 submitted" shown | P1 | High | Positive |
| TC-029 | Game | Round result overlay appears | All players submit | 1. All submit | — | RoundResultOverlay shown within 1s | P0 | Critical | Positive |
| TC-030 | Game | Overlay shows correct data | Round resolved | 1. Read overlay | — | Average, target, winner(s), all picks shown | P0 | Critical | Positive |
| TC-031 | Game | Overlay stays for ~5s | Round resolved | 1. Start timer at overlay appear | — | Next round starts ~5s after overlay shows | P1 | High | Positive |
| TC-032 | Game | Timer resets for each round | Round 2 starts | 1. Observe timer | timerDuration from settings | Timer restarts from configured duration | P0 | Critical | Positive |
| TC-033 | Game | Eliminated player cannot submit | Player at 5pts | 1. Try to submit | no=50 | Server ignores, no error (already eliminated) | P0 | Critical | Negative |
| TC-034 | Game | Eliminated player shown crossed out | Player eliminated | 1. View score panel | — | Player row strikethrough, skull icon | P1 | High | Positive |
| TC-035 | Game | Game over when 1 player remains | 1 active player | 1. Last player wins round | — | `game_over` event, GameOverScreen shown | P0 | Critical | Positive |
| TC-036 | Game | Host can restart game | Game over screen | 1. Host clicks Restart | — | New game starts from round 1 | P1 | High | Positive |
| TC-037 | Game | Non-host cannot restart game | Game over screen | 1. Non-host intercepts restart_game | — | Server rejects | P1 | High | Negative |

### Module 4: Game Rules Engine

| TC-ID | Module | Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Type |
|-------|--------|----------|---------------|------------|-----------|-----------------|----------|----------|------|
| TC-038 | Rules | Duplicate rule voids round (3 players all same) | 3 players | 1. All submit 50 | [50,50,50] | round_void: "All numbers were duplicated" | P0 | Critical | Positive |
| TC-039 | Rules | Duplicate rule: unique survivor wins | 3 players | 1. Two submit 50, one submits 30 | [50,50,30] | Player with 30 wins; 50s are invalid | P0 | Critical | Positive |
| TC-040 | Rules | No duplicate rule with 2 players | 2 players | 1. Both submit 50 | [50,50] | round_void: "Both players chose same number" | P0 | Critical | Positive |
| TC-041 | Rules | Exact match triggers +2 penalty | 3 players, winner hits target | Calculated target=40 | Submission=40 | exactMatch=true, non-winners get +2pts | P0 | Critical | Positive |
| TC-042 | Rules | Normal round: non-winners get +1 | 3 players | Submit different numbers | No exact match | Non-winners each get +1 | P0 | Critical | Positive |
| TC-043 | Rules | Co-winners: both get 0 pts | 3 players | Two equidistant from target | [30,70,50] target=50 | Both equidistant players win, 0 pts each | P1 | High | Positive |
| TC-044 | Rules | 2-player cycle: 100 beats 0 | 2 players | 1. Player A=100, B=0 | [100,0] | A wins (cycle rule) | P0 | Critical | Positive |
| TC-045 | Rules | 2-player cycle: 0 beats 1 | 2 players | 1. Player A=0, B=1 | [0,1] | A wins | P0 | Critical | Positive |
| TC-046 | Rules | 2-player cycle: 1 beats 100 | 2 players | 1. Player A=1, B=100 | [1,100] | A wins | P0 | Critical | Positive |
| TC-047 | Rules | 2-player normal (non-cycle numbers) | 2 players | 1. A=40, B=60, target=40 | — | A wins (closer to target) | P0 | Critical | Positive |
| TC-048 | Rules | Elimination at threshold | Player at 4pts, loses round | +1 penalty | points[player]=5 | Player eliminated, `player_eliminated` emitted | P0 | Critical | Positive |
| TC-049 | Rules | Custom timer setting respected | Host sets 60s | Start game | timerDuration=60 | Timer runs 60s, not default 30s | P1 | High | Positive |
| TC-050 | Rules | Custom elimination threshold | Host sets 3pts | Players accumulate pts | eliminationThreshold=3 | Player eliminated at 3 not 5 | P1 | High | Positive |
| TC-051 | Rules | Duplicate rule disabled by host | Host disables it | All submit same number | duplicateRuleEnabled=false | No void, normal evaluation proceeds | P1 | High | Positive |
| TC-052 | Rules | Target multiplier 0.6 | Host sets 0.6 | Submit numbers | avg=50 | target=30 (50×0.6) | P1 | High | Positive |
| TC-053 | Rules | Settings sanitized: invalid timer | Host sends timer=999 | start_game | timerDuration=999 | Clamped to 30 (default) | P0 | Critical | Negative |

### Module 5: Timer System

| TC-ID | Module | Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Type |
|-------|--------|----------|---------------|------------|-----------|-----------------|----------|----------|------|
| TC-054 | Timer | Timer counts down visually | Round started | 1. Watch timer | timerDuration=30 | Countdown from 30 to 0 | P0 | Critical | Positive |
| TC-055 | Timer | Timer expiry triggers auto-submit | 30s elapsed, not submitted | Wait 30s | — | timer_expired event, missing player gets +1 | P0 | Critical | Positive |
| TC-056 | Timer | All-submit cancels timer early | All submit before expiry | Submit within 10s | — | Timer cleared, round resolves immediately | P0 | Critical | Positive |
| TC-057 | Timer | Timer resets per round | Round 2 begins | Watch timer | — | Restarts from configured duration | P0 | Critical | Positive |
| TC-058 | Timer | timer_tick drift correction | Long-running round | Wait 10s mark | — | timer_tick broadcast with secondsLeft | P2 | Low | Positive |
| TC-059 | Timer | Late submission after expiry blocked | Timer expired | Try to submit | — | `round_already_completed` event, no effect | P0 | Critical | Negative |

### Module 6: Voice Chat

| TC-ID | Module | Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Type |
|-------|--------|----------|---------------|------------|-----------|-----------------|----------|----------|------|
| TC-060 | Voice | Join voice: mic permission granted | In room | 1. Click Join 2. Allow mic | — | Joined state, speaking detector starts | P0 | Critical | Positive |
| TC-061 | Voice | Join voice: mic permission denied | In room | 1. Click Join 2. Deny mic | — | Error: "Microphone access denied" | P0 | Critical | Negative |
| TC-062 | Voice | Peer-to-peer audio established | 2 players joined | Both click Join | — | Audio streams connected, both can hear | P0 | Critical | Positive |
| TC-063 | Voice | Speaking ring appears when talking | Joined voice | 1. Speak into mic | Audio above threshold | Green pulsing ring around avatar | P1 | High | Positive |
| TC-064 | Voice | Mute self | Joined voice | 1. Click mute button | — | Mic track disabled, 🔇 shown, peers see muted | P0 | Critical | Positive |
| TC-065 | Voice | Unmute self | Muted | 1. Click unmute | — | Mic track enabled, mute indicator gone | P0 | Critical | Positive |
| TC-066 | Voice | Peer mute shown in UI | Peer muted | Peer clicks mute | — | Peer tile shows 🔇 | P1 | High | Positive |
| TC-067 | Voice | Leave voice | Joined | 1. Click Leave | — | Local stream stopped, peers get peer_left, tiles removed | P0 | Critical | Positive |
| TC-068 | Voice | Peer leaves: tile removed | Peer in voice | Peer closes tab | — | voice_peer_left received, tile disappears | P1 | High | Positive |
| TC-069 | Voice | Voice persists WaitingRoom→Game | In voice during waiting room | Host starts game | — | P2P connections survive screen transition | P0 | Critical | Positive |
| TC-070 | Voice | 3rd peer joins mid-session | 2 in voice | 3rd player joins voice | — | Existing peers get voice_peer_joined, connections form | P1 | High | Positive |
| TC-071 | Voice | Browser without WebRTC | Safari <12 (legacy) | Click Join | — | Error: "not_supported" | P1 | High | Negative |

### Module 7: Chat System

| TC-ID | Module | Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Type |
|-------|--------|----------|---------------|------------|-----------|-----------------|----------|----------|------|
| TC-072 | Chat | Send message in waiting room | In WaitingRoom | 1. Type "Hello" 2. Press Enter | "Hello" | Message appears for all players with avatar+name | P1 | High | Positive |
| TC-073 | Chat | Empty message not sent | In WaitingRoom | 1. Press Enter without text | "" | No message sent | P1 | High | Negative |
| TC-074 | Chat | Rate limit enforced | Send 5 messages quickly | 1. Spam 10 messages | — | After limit: rate_limited alert, slow down | P1 | High | Negative |
| TC-075 | Chat | Typing indicator shown | Player typing | 1. Start typing | — | "Alice is typing…" shown to others | P2 | Low | Positive |
| TC-076 | Chat | Typing indicator clears | Player stops typing | 1. Stop for 2s | — | Indicator disappears | P2 | Low | Positive |
| TC-077 | Chat | Long message displayed | Send 500-char message | 1. Send long text | 500 chars | Displayed with wrap, no overflow | P2 | Medium | Positive |

### Module 8: Emote System

| TC-ID | Module | Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Type |
|-------|--------|----------|---------------|------------|-----------|-----------------|----------|----------|------|
| TC-078 | Emote | Send emote | In game | 1. Click 😂 emote | emoji=😂 | Floating emote shown to all players | P2 | Low | Positive |
| TC-079 | Emote | Emote rate limit | Spam emotes | 1. Click same emote 10× fast | — | Rate limited, excess ignored | P2 | Low | Negative |

### Module 9: Achievements & XP

| TC-ID | Module | Scenario | Preconditions | Test Steps | Test Data | Expected Result | Priority | Severity | Type |
|-------|--------|----------|---------------|------------|-----------|-----------------|----------|----------|------|
| TC-080 | XP | XP awarded at game end | Game over | 1. Complete game | survived=true | xp_update event received with xpGained | P1 | High | Positive |
| TC-081 | XP | Level-up toast shown | XP crosses threshold | 1. Complete game | levelUp=true | "Level Up!" toast with new level | P1 | High | Positive |
| TC-082 | Achievement | Achievement unlocked toast | Trigger condition | 1. Win first game | — | Achievement toast appears with icon | P1 | High | Positive |
| TC-083 | Achievement | Achievement not awarded twice | Already unlocked | 1. Complete game again | — | No duplicate toast | P1 | High | Negative |

---

## 2. Unit Test Cases with Code

### 2.1 gameRules.js — Node.js / Jest

```js
// __tests__/gameRules.test.js
const {
  applyDuplicateRule, isRoundVoid, applyTwoPlayerCycle,
  findWinners, hasExactMatch, computePenalties, RULES,
} = require("../server/utils/gameRules");

// ── applyDuplicateRule ────────────────────────────────────────────────────────

describe("applyDuplicateRule", () => {
  const s = (id, num) => ({ socketId: id, number: num });

  test("UT-001: all unique → all valid", () => {
    const result = applyDuplicateRule([s("A",10),s("B",20),s("C",30)], 3);
    expect(result.valid).toHaveLength(3);
    expect(result.invalid).toHaveLength(0);
  });

  test("UT-002: one duplicate pair → both invalid", () => {
    const result = applyDuplicateRule([s("A",50),s("B",50),s("C",30)], 3);
    expect(result.valid).toEqual([s("C",30)]);
    expect(result.invalid).toHaveLength(2);
  });

  test("UT-003: all same → all invalid", () => {
    const result = applyDuplicateRule([s("A",50),s("B",50),s("C",50)], 3);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(3);
  });

  test("UT-004: 2 players → duplicate rule skipped", () => {
    const result = applyDuplicateRule([s("A",50),s("B",50)], 2);
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
  });

  test("UT-005: boundary — 0 and 100 are unique", () => {
    const result = applyDuplicateRule([s("A",0),s("B",100),s("C",50)], 3);
    expect(result.valid).toHaveLength(3);
  });

  test("UT-006: three different duplicates", () => {
    const result = applyDuplicateRule(
      [s("A",10),s("B",10),s("C",20),s("D",20),s("E",30)], 5
    );
    expect(result.valid).toEqual([s("E",30)]);
    expect(result.invalid).toHaveLength(4);
  });
});

// ── isRoundVoid ────────────────────────────────────────────────────────────────

describe("isRoundVoid", () => {
  const s = (id, num) => ({ socketId: id, number: num });

  test("UT-007: 2 players same number → void", () => {
    const subs = [s("A",50), s("B",50)];
    expect(isRoundVoid(subs, subs, 2).isVoid).toBe(true);
  });

  test("UT-008: 2 players different numbers → not void", () => {
    const subs = [s("A",40), s("B",60)];
    expect(isRoundVoid(subs, subs, 2).isVoid).toBe(false);
  });

  test("UT-009: all duplicates (no valid) → void", () => {
    expect(isRoundVoid([], [s("A",50),s("B",50)], 3).isVoid).toBe(true);
  });

  test("UT-010: at least one valid submission → not void", () => {
    const valid = [s("C",30)];
    const all   = [s("A",50),s("B",50),s("C",30)];
    expect(isRoundVoid(valid, all, 3).isVoid).toBe(false);
  });

  test("UT-011: void reason message present", () => {
    const result = isRoundVoid([], [s("A",50),s("B",50)], 3);
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe("string");
  });
});

// ── applyTwoPlayerCycle ────────────────────────────────────────────────────────

describe("applyTwoPlayerCycle", () => {
  const s = (id, num) => ({ socketId: id, number: num });

  test("UT-012: 100 beats 0 → A wins", () => {
    expect(applyTwoPlayerCycle([s("A",100),s("B",0)])).toBe("A");
  });

  test("UT-013: 0 beats 1 → A wins", () => {
    expect(applyTwoPlayerCycle([s("A",0),s("B",1)])).toBe("A");
  });

  test("UT-014: 1 beats 100 → A wins", () => {
    expect(applyTwoPlayerCycle([s("A",1),s("B",100)])).toBe("A");
  });

  test("UT-015: reversed — 0 vs 100, B wins", () => {
    expect(applyTwoPlayerCycle([s("A",0),s("B",100)])).toBe("B");
  });

  test("UT-016: non-cycle numbers → null (fall through)", () => {
    expect(applyTwoPlayerCycle([s("A",40),s("B",60)])).toBeNull();
  });

  test("UT-017: one cycle number, one not → null", () => {
    expect(applyTwoPlayerCycle([s("A",100),s("B",50)])).toBeNull();
  });

  test("UT-018: 3 submissions → null", () => {
    expect(applyTwoPlayerCycle([s("A",1),s("B",100),s("C",0)])).toBeNull();
  });
});

// ── findWinners ────────────────────────────────────────────────────────────────

describe("findWinners", () => {
  const s = (id, num) => ({ socketId: id, number: num });

  test("UT-019: single closest wins", () => {
    expect(findWinners([s("A",30),s("B",60)], 40)).toEqual(["A"]);
  });

  test("UT-020: co-winners equidistant", () => {
    const winners = findWinners([s("A",30),s("B",50),s("C",70)], 50);
    expect(winners).toEqual(["B"]);
  });

  test("UT-021: two equidistant from target", () => {
    const winners = findWinners([s("A",30),s("B",70)], 50);
    expect(winners).toHaveLength(2);
    expect(winners).toContain("A");
    expect(winners).toContain("B");
  });

  test("UT-022: exact target hit", () => {
    expect(findWinners([s("A",50),s("B",20)], 50)).toEqual(["A"]);
  });

  test("UT-023: empty submissions → empty array", () => {
    expect(findWinners([], 50)).toEqual([]);
  });

  test("UT-024: boundary — target 0", () => {
    expect(findWinners([s("A",0),s("B",10)], 0)).toEqual(["A"]);
  });
});

// ── hasExactMatch ─────────────────────────────────────────────────────────────

describe("hasExactMatch", () => {
  const s = (id, num) => ({ socketId: id, number: num });

  test("UT-025: winner hits target exactly", () => {
    expect(hasExactMatch([s("A",40)], 40, ["A"])).toBe(true);
  });

  test("UT-026: winner close but not exact", () => {
    expect(hasExactMatch([s("A",40)], 40.001, ["A"])).toBe(false);
  });

  test("UT-027: non-winner hits target → false", () => {
    expect(hasExactMatch([s("A",40),s("B",40)], 40, ["B"])).toBe(false);
  });

  test("UT-028: floating point: 0.1+0.2 scenario", () => {
    // target = 0.3, submission = 0.3 (within epsilon)
    expect(hasExactMatch([s("A",0.3)], 0.30000000001, ["A"])).toBe(true);
  });
});

// ── computePenalties ──────────────────────────────────────────────────────────

describe("computePenalties", () => {
  test("UT-029: non-winner gets +1", () => {
    const result = computePenalties(["A","B"], ["A"], false, {A:0,B:0}, [], 5);
    expect(result.updatedPoints.B).toBe(1);
    expect(result.updatedPoints.A).toBe(0);
  });

  test("UT-030: exact match → non-winner gets +2", () => {
    const result = computePenalties(["A","B"], ["A"], true, {A:0,B:0}, [], 5);
    expect(result.updatedPoints.B).toBe(2);
  });

  test("UT-031: player eliminated at threshold", () => {
    const result = computePenalties(["A","B"], ["A"], false, {A:0,B:4}, [], 5);
    expect(result.newlyEliminated).toContain("B");
  });

  test("UT-032: already eliminated player not double-penalised", () => {
    const result = computePenalties(["A","B"], ["A"], false, {A:0,B:5}, ["B"], 5);
    expect(result.updatedPoints.B).toBe(5); // unchanged
    expect(result.newlyEliminated).not.toContain("B");
  });

  test("UT-033: co-winners both get 0 pts", () => {
    const result = computePenalties(["A","B","C"], ["A","B"], false, {A:0,B:0,C:0}, [], 5);
    expect(result.updatedPoints.A).toBe(0);
    expect(result.updatedPoints.B).toBe(0);
    expect(result.updatedPoints.C).toBe(1);
  });

  test("UT-034: custom elimination threshold honoured", () => {
    const result = computePenalties(["A","B"], ["A"], false, {A:0,B:2}, [], 3);
    expect(result.newlyEliminated).toContain("B");
  });
});

// ── sanitizeSettings ──────────────────────────────────────────────────────────

const { sanitizeSettings } = require("../server/utils/gameManager");

describe("sanitizeSettings", () => {
  test("UT-035: valid settings pass through", () => {
    const s = sanitizeSettings({ timerDuration:60, eliminationThreshold:3, targetMultiplier:0.6, duplicateRuleEnabled:false });
    expect(s).toEqual({ timerDuration:60, eliminationThreshold:3, targetMultiplier:0.6, duplicateRuleEnabled:false });
  });

  test("UT-036: invalid timerDuration falls back to 30", () => {
    expect(sanitizeSettings({ timerDuration:999 }).timerDuration).toBe(30);
  });

  test("UT-037: invalid eliminationThreshold falls back to 5", () => {
    expect(sanitizeSettings({ eliminationThreshold:10 }).eliminationThreshold).toBe(5);
  });

  test("UT-038: null input → all defaults", () => {
    const s = sanitizeSettings(null);
    expect(s.timerDuration).toBe(30);
    expect(s.eliminationThreshold).toBe(5);
    expect(s.targetMultiplier).toBe(0.8);
    expect(s.duplicateRuleEnabled).toBe(true);
  });

  test("UT-039: string numbers coerced", () => {
    expect(sanitizeSettings({ timerDuration:"60" }).timerDuration).toBe(60);
  });

  test("UT-040: unknown keys not included", () => {
    const s = sanitizeSettings({ malicious: "DROP TABLE users" });
    expect(s.malicious).toBeUndefined();
  });
});
```

### 2.2 timerService.js — Node.js / Jest

```js
// __tests__/timerService.test.js
jest.useFakeTimers();
const timerService = require("../server/services/timerService");

describe("timerService", () => {
  let io;
  beforeEach(() => {
    io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
  });

  test("UT-041: timer fires onExpire after duration", () => {
    const onExpire = jest.fn();
    timerService.startTimer(io, "room1", { game: { round:1 } }, 30, onExpire);
    jest.advanceTimersByTime(30000);
    expect(onExpire).toHaveBeenCalledWith(io, "room1");
  });

  test("UT-042: clearTimer prevents onExpire", () => {
    const onExpire = jest.fn();
    timerService.startTimer(io, "room1", { game: { round:1 } }, 30, onExpire);
    timerService.clearTimer("room1");
    jest.advanceTimersByTime(30000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  test("UT-043: getTimeLeft returns approximate seconds", () => {
    timerService.startTimer(io, "room1", { game: { round:1 } }, 30, jest.fn());
    jest.advanceTimersByTime(10000);
    const left = timerService.getTimeLeft("room1");
    expect(left).toBeCloseTo(20, 0);
  });

  test("UT-044: getTimeLeft returns null after clear", () => {
    timerService.startTimer(io, "room1", { game: { round:1 } }, 30, jest.fn());
    timerService.clearTimer("room1");
    expect(timerService.getTimeLeft("room1")).toBeNull();
  });

  test("UT-045: starting new timer clears existing", () => {
    const expire1 = jest.fn();
    const expire2 = jest.fn();
    timerService.startTimer(io, "room1", { game: { round:1 } }, 30, expire1);
    timerService.startTimer(io, "room1", { game: { round:2 } }, 30, expire2);
    jest.advanceTimersByTime(30000);
    expect(expire1).not.toHaveBeenCalled();
    expect(expire2).toHaveBeenCalledTimes(1);
  });

  test("UT-046: timer_tick broadcast every 10s", () => {
    timerService.startTimer(io, "room1", { game: { round:1 } }, 30, jest.fn());
    jest.advanceTimersByTime(10000);
    expect(io.emit).toHaveBeenCalledWith("timer_tick", expect.objectContaining({ secondsLeft: expect.any(Number) }));
  });

  afterEach(() => {
    timerService.clearTimer("room1");
    jest.clearAllTimers();
  });
});
```

### 2.3 React Components — Jest + React Testing Library

```jsx
// __tests__/VoicePanel.test.jsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import VoicePanel from "../client/src/components/VoicePanel";
import { VoiceContext } from "../client/src/contexts/VoiceContext";
import { GameContext } from "../client/src/contexts/GameContext";
import { UserContext } from "../client/src/contexts/UserContext";

const mkVoiceCtx = (overrides = {}) => ({
  joined: false, isMuted: false, localSpeaking: false,
  error: null, peers: {},
  joinVoice: jest.fn(), leaveVoice: jest.fn(), toggleMute: jest.fn(),
  ...overrides,
});

const mkGameCtx  = () => ({ players: [{ socketId:"s1", name:"Alice", avatar:"🐱" }] });
const mkUserCtx  = () => ({ user: { name:"Bob", avatar:"🐶" } });

const Wrapper = ({ voiceCtx }) => (
  <UserContext.Provider value={mkUserCtx()}>
    <GameContext.Provider value={mkGameCtx()}>
      <VoiceContext.Provider value={voiceCtx}>
        <VoicePanel />
      </VoiceContext.Provider>
    </GameContext.Provider>
  </UserContext.Provider>
);

describe("VoicePanel", () => {
  test("UT-047: shows Join button when not joined", () => {
    render(<Wrapper voiceCtx={mkVoiceCtx()} />);
    expect(screen.getByText(/Join/i)).toBeInTheDocument();
  });

  test("UT-048: Join button calls joinVoice", () => {
    const joinVoice = jest.fn();
    render(<Wrapper voiceCtx={mkVoiceCtx({ joinVoice })} />);
    fireEvent.click(screen.getByText(/Join/i));
    expect(joinVoice).toHaveBeenCalledTimes(1);
  });

  test("UT-049: shows permission_denied error message", () => {
    render(<Wrapper voiceCtx={mkVoiceCtx({ error: "permission_denied" })} />);
    expect(screen.getByText(/Microphone access denied/i)).toBeInTheDocument();
  });

  test("UT-050: shows Live badge when joined", () => {
    render(<Wrapper voiceCtx={mkVoiceCtx({ joined: true })} />);
    expect(screen.getByText(/Voice Chat/i)).toBeInTheDocument();
  });

  test("UT-051: mute button calls toggleMute", () => {
    const toggleMute = jest.fn();
    render(<Wrapper voiceCtx={mkVoiceCtx({ joined: true, toggleMute })} />);
    const muteBtn = screen.getByTitle(/Mute/i);
    fireEvent.click(muteBtn);
    expect(toggleMute).toHaveBeenCalledTimes(1);
  });

  test("UT-052: leave button calls leaveVoice", () => {
    const leaveVoice = jest.fn();
    render(<Wrapper voiceCtx={mkVoiceCtx({ joined: true, leaveVoice })} />);
    fireEvent.click(screen.getByTitle(/Leave voice/i));
    expect(leaveVoice).toHaveBeenCalledTimes(1);
  });

  test("UT-053: muted banner shown when isMuted", () => {
    render(<Wrapper voiceCtx={mkVoiceCtx({ joined: true, isMuted: true })} />);
    expect(screen.getByText(/You are muted/i)).toBeInTheDocument();
  });

  test("UT-054: local user tile shows speaking ring", () => {
    const { container } = render(<Wrapper voiceCtx={mkVoiceCtx({ joined: true, localSpeaking: true })} />);
    expect(container.querySelector(".animate-ping")).toBeInTheDocument();
  });

  test("UT-055: remote peer tile rendered", () => {
    const peers = { "s1": { speaking: false, muted: false, connected: true } };
    render(<Wrapper voiceCtx={mkVoiceCtx({ joined: true, peers })} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  test("UT-056: waiting for others message when no peers", () => {
    render(<Wrapper voiceCtx={mkVoiceCtx({ joined: true, peers: {} })} />);
    expect(screen.getByText(/Waiting for others/i)).toBeInTheDocument();
  });
});

// ── CountdownTimer ────────────────────────────────────────────────────────────
// __tests__/CountdownTimer.test.jsx
import { render, act } from "@testing-library/react";
import CountdownTimer from "../client/src/components/CountdownTimer";

describe("CountdownTimer", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("UT-057: renders initial duration", () => {
    const { getByText } = render(<CountdownTimer timerDuration={30} />);
    expect(getByText("30")).toBeInTheDocument();
  });

  test("UT-058: counts down each second", () => {
    const { getByText } = render(<CountdownTimer timerDuration={5} />);
    act(() => jest.advanceTimersByTime(2000));
    expect(getByText("3")).toBeInTheDocument();
  });

  test("UT-059: stops at 0, does not go negative", () => {
    const { getByText } = render(<CountdownTimer timerDuration={2} />);
    act(() => jest.advanceTimersByTime(5000));
    expect(getByText("0")).toBeInTheDocument();
  });

  test("UT-060: remounts reset timer (key prop pattern)", () => {
    const { rerender, getByText } = render(<CountdownTimer key="r1" timerDuration={30} />);
    act(() => jest.advanceTimersByTime(10000));
    expect(getByText("20")).toBeInTheDocument();
    rerender(<CountdownTimer key="r2" timerDuration={30} />);
    expect(getByText("30")).toBeInTheDocument();
  });
});
```

---

## 3. API Test Cases

### REST Endpoints

| TC-ID | Endpoint | Method | Scenario | Payload | Expected Status | Expected Response | Type |
|-------|----------|--------|----------|---------|-----------------|-------------------|------|
| API-001 | `/api/health` | GET | Health check nominal | None | 200 | `{status:"ok", redis:"ok"}` | Positive |
| API-002 | `/api/health` | GET | Redis down | None | 200 | `{status:"ok", redis:"unavailable"}` | Negative |
| API-003 | `/api/stats` | GET | Active rooms present | None | 200 | `{activeRooms:N, activePlayers:N, gamesInProgress:N}` | Positive |
| API-004 | `/api/stats` | GET | No active rooms | None | 200 | `{activeRooms:0, activePlayers:0, gamesInProgress:0}` | Positive |
| API-005 | `/api/stats` | GET | Redis unavailable | None | 500 | `{error:"stats unavailable"}` | Negative |
| API-006 | `/api/leaderboard` | GET | Leaderboard data exists | None | 200 | `{leaderboard:[...entries]}` | Positive |
| API-007 | `/api/leaderboard` | GET | DB unavailable | None | 500 | `{error:"leaderboard unavailable", leaderboard:[]}` | Negative |
| API-008 | `/api/room/:code` | GET | Valid room code | code=`ABC123` | 200 | `{roomId:"uuid-..."}` | Positive |
| API-009 | `/api/room/:code` | GET | Invalid/expired code | code=`XXXXXX` | 404 | `{error:"Room not found or expired"}` | Negative |
| API-010 | `/api/room/:code` | GET | Empty code param | code=`` | 404 | Error response | Negative |
| API-011 | `/api/room/code` | POST | Generate code for room | `{roomId:"valid-uuid"}` | 200 | `{code:"ABCDEF"}` (6 chars) | Positive |
| API-012 | `/api/room/code` | POST | Missing roomId | `{}` | 400 | `{error:"roomId required"}` | Negative |
| API-013 | `/api/room/code` | POST | Null roomId | `{roomId:null}` | 400 | `{error:"roomId required"}` | Negative |
| API-014 | `/api/room/code` | POST | SQL injection in roomId | `{roomId:"'; DROP TABLE rooms;--"}` | 400 or 200 | No DB error, sanitised | Negative |
| API-015 | `/api/player/:deviceId/stats` | GET | Valid deviceId | deviceId=`valid-uuid` | 200 | Player stats JSON | Positive |
| API-016 | `/api/player/:deviceId/stats` | GET | Non-existent deviceId | deviceId=`unknown` | 404 | `{error:"Player not found"}` | Negative |
| API-017 | `/api/player/:deviceId/stats` | GET | DB unavailable | — | 500 | `{error:"unavailable"}` | Negative |
| API-018 | `/api/player/:deviceId/stats` | GET | XSS in deviceId param | `<script>alert(1)</script>` | 400/404 | No XSS execution | Negative |
| API-019 | Any | POST | Request body > 10MB | Giant payload | 413 | Payload too large error | Negative |
| API-020 | Any | GET | CORS: unknown origin | Origin: `http://evil.com` | 200 (currently) | Should restrict in production | Security |

### Socket.IO Events

| TC-ID | Event | Direction | Scenario | Payload | Expected Outcome |
|-------|-------|-----------|----------|---------|-----------------|
| SOCK-001 | `join_room` | C→S | Valid join | `{roomId, user, roomType, deviceId}` | `room_update` broadcast to room |
| SOCK-002 | `join_room` | C→S | Non-existent room | `{roomId:"fake-id"}` | `error_message` emitted |
| SOCK-003 | `start_game` | C→S | Non-host tries to start | — | `error_message`: only host can start |
| SOCK-004 | `send_number` | C→S | Valid submission | `{roomId, user, no:42}` | `number_received` ack + state update |
| SOCK-005 | `send_number` | C→S | Out of range: -1 | `{no:-1}` | Clamped to 0, accepted |
| SOCK-006 | `send_number` | C→S | Out of range: 101 | `{no:101}` | Clamped to 100, accepted |
| SOCK-007 | `send_number` | C→S | NaN | `{no:"abc"}` | `invalid_number` event |
| SOCK-008 | `send_number` | C→S | After timer expired | `{no:50}` | `round_already_completed` |
| SOCK-009 | `send_number` | C→S | Not in room | `{roomId:"other"}` | `not_in_room` event |
| SOCK-010 | `voice_ready` | C→S | First in voice | `{roomId}` | `voice_existing_peers: {peers:[]}` |
| SOCK-011 | `voice_ready` | C→S | Second in voice | `{roomId}` | `voice_existing_peers` with first peer's ID |
| SOCK-012 | `voice_offer` | C→S | Valid offer relay | `{to, offer}` | `voice_offer` forwarded to target with `from` |
| SOCK-013 | `voice_mute` | C→S | Mute broadcast | `{roomId, muted:true}` | `voice_peer_muted` to room (excl. sender) |
| SOCK-014 | `voice_leave` | C→S | Leave voice | `{roomId}` | `voice_peer_left` to remaining members |
| SOCK-015 | `restart_game` | C→S | Non-host restart | `{roomId}` | `error_message`: only host can restart |

---

## 4. Security Test Cases

| TC-ID | Category | Scenario | Attack Vector | Steps | Expected | Risk Level |
|-------|----------|----------|---------------|-------|----------|------------|
| SEC-001 | Host Auth | Non-host starts game | Intercept WebSocket, spoof start_game | Emit `start_game` with any socket | Server rejects if `socket.id !== room.hostSocketId` | **Critical** |
| SEC-002 | Host Auth | Non-host restarts game | Same as above for restart_game | Emit `restart_game` | Server rejects | **Critical** |
| SEC-003 | IDOR | Access other player's stats | Enumerate deviceId | `GET /api/player/{randomUUID}/stats` | 404 if not found; stats of another user if UUID guessed | **High** |
| SEC-004 | IDOR | Join any room by guessing roomId | Brute-force UUIDs | `join_room` with guessed IDs | Only valid rooms joinable; rooms are UUID v4 (2¹²² space) | **Medium** |
| SEC-005 | Input Validation | XSS in player name | `<script>alert(1)</script>` as name | Set as user.name, send to room | Name rendered as text (React default escaping) — not executed | **Critical** |
| SEC-006 | Input Validation | XSS in chat message | `<img src=x onerror=alert(1)>` | Send via room_chat | Rendered as text, no execution | **Critical** |
| SEC-007 | Input Validation | Script in avatar emoji | `<svg onload=alert(1)>` | Set as avatar | No execution | **High** |
| SEC-008 | SQL Injection | Inject via deviceId param | `' OR 1=1 --` in URL | `GET /api/player/' OR 1=1 --/stats` | Prisma parameterised query — no injection | **Critical** |
| SEC-009 | SQL Injection | Inject via POST body | `{roomId: "'; DROP TABLE rooms;--"}` | POST `/api/room/code` | No DB mutation; input sanitised | **Critical** |
| SEC-010 | NoSQL Injection | Redis key manipulation | `room:../../etc/passwd` | Craft join_room payload | Key sanitised; Redis reads empty | **High** |
| SEC-011 | Rate Limiting | Brute-force room codes | Enumerate 6-char codes (26^6) | Rapid GET /api/room/:code | Rate limiter triggers; 429 returned | **High** |
| SEC-012 | Rate Limiting | Socket event flooding | 1000 `send_number` events/sec | Automated script | Rate limiter cuts connection | **High** |
| SEC-013 | Rate Limiting | Chat spam | 50 messages in 1 second | Automate `room_chat` emits | `chat_rate_limited` after threshold | **Medium** |
| SEC-014 | Session Hijacking | Steal socket session | Capture socket ID via log injection | Replay socket.id in another connection | Socket.IO sessions are server-managed; replay not applicable | **Medium** |
| SEC-015 | CSRF | Trigger room creation via CSRF | Craft malicious form POST | POST `/api/room/code` from evil.com | CORS `*` allows this — add origin whitelist in production | **High** |
| SEC-016 | Prototype Pollution | Pollute Object.prototype | `{"__proto__":{"admin":true}}` in settings | Send as start_game settings | sanitizeSettings ignores unknown keys | **Critical** |
| SEC-017 | DoS — Large Payload | Crash server with huge message | 100MB JSON body | POST any endpoint | express.json() default 100kb limit | **High** |
| SEC-018 | DoS — Room Flooding | Create unlimited rooms | Automated join_room with new IDs | Thousands of room creates | Redis memory exhausted; TTL needed | **High** |
| SEC-019 | Voice — Media Interception | MITM WebRTC stream | Network-level MITM | Intercept ICE/DTLS | WebRTC is DTLS-encrypted end-to-end by spec | **Low** |
| SEC-020 | Voice — Signaling Spoofing | Send fake offer to peer | Forge `voice_offer` from another socket | Emit with fabricated `from` | Server sets `from: socket.id`, cannot be spoofed | **Medium** |
| SEC-021 | Sensitive Data Exposure | deviceId in URL/logs | Check server logs | Review all console.log/debug | deviceId must not appear in URL params | **Medium** |
| SEC-022 | Command Injection | Shell metacharacters in settings | `; rm -rf /` in timerDuration | Via start_game | Only whitelisted numeric values accepted | **Critical** |
| SEC-023 | WebSocket Denial | Flood disconnects/reconnects | 1000 connect/disconnect cycles | Automated script | Server handles gracefully, no leak | **High** |
| SEC-024 | Data Exfiltration | Read Redis keys via game | Craft roomId=`room:*` | join_room | Key format `room:{uuid}` — wildcard not interpolated | **Medium** |

---

## 5. Performance Test Cases

### 5.1 Load Testing

| TC-ID | Scenario | Concurrent Users | Duration | TPS Target | P95 Response | Tool |
|-------|----------|-----------------|----------|------------|--------------|------|
| PERF-001 | Normal game load | 100 socket clients (25 rooms × 4 players) | 10 min | 500 events/s | < 200ms | k6 / Artillery |
| PERF-002 | Peak concurrent rooms | 500 rooms × 2 players | 5 min | 2000 events/s | < 500ms | k6 |
| PERF-003 | REST API load | 200 concurrent GET /api/health | 5 min | 1000 req/s | < 50ms | k6 |
| PERF-004 | Leaderboard under load | 500 concurrent GET /api/leaderboard | 5 min | 500 req/s | < 300ms | k6 |
| PERF-005 | Voice signaling load | 100 rooms × 4 peers signaling | 5 min | 400 signalings/s | < 100ms | k6 |

### 5.2 Stress Testing

| TC-ID | Scenario | Concurrent Users | Ramp-up | Break Point | Expected Behaviour |
|-------|----------|-----------------|---------|-------------|-------------------|
| PERF-006 | Stress: socket connections | Ramp to 2000 sockets | 0→2000 in 5 min | TBD | Graceful degradation; no crash |
| PERF-007 | Redis under write stress | 1000 saveRoom calls/s | Instant | TBD | Redis pipeline/queue, < 10ms per op |
| PERF-008 | Simultaneous game resolves | 500 rooms resolve at same time | Instant | TBD | evaluateRound is sync; no shared state |

### 5.3 Spike Testing

| TC-ID | Scenario | Normal Load | Spike Load | Duration | Expected |
|-------|----------|-------------|------------|----------|----------|
| PERF-009 | Viral spike | 50 users | 500 users in 30s | 2 min | Graceful; new rooms created; no crash |
| PERF-010 | All players submit simultaneously | 4 players/room | 100 rooms × 4 all submit at T+0 | Instant | Race-safe; each room resolves correctly |

### 5.4 Endurance Testing

| TC-ID | Scenario | Load | Duration | Metrics to Monitor |
|-------|----------|------|----------|--------------------|
| PERF-011 | 24h game endurance | 50 concurrent rooms | 24h | Memory, Redis key count, timer Map size, CPU |
| PERF-012 | Timer Map memory leak | 200 rooms created/destroyed | 4h | `timers` Map size should stabilise at ≤ active rooms |

### 5.5 Monitoring Metrics

| Metric | Tool | Alert Threshold |
|--------|------|-----------------|
| Socket event latency | Socket.IO metrics | > 500ms P99 |
| Redis GET/SET latency | Redis INFO | > 10ms |
| Node.js heap | `process.memoryUsage()` | > 512MB |
| Event loop lag | `--inspect` / clinic.js | > 100ms |
| Timer Map size | Custom gauge | > active rooms |
| PostgreSQL slow queries | pg_stat_statements | > 500ms |

### 5.6 k6 Load Test Script

```js
// perf/loadTest.js
import ws from "k6/ws";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "1m", target: 100 },
    { duration: "3m", target: 100 },
    { duration: "1m", target: 0  },
  ],
  thresholds: {
    "ws_session_duration": ["p(95)<5000"],
    "checks": ["rate>0.99"],
  },
};

export default function () {
  const res = ws.connect("ws://localhost:5000/socket.io/?EIO=4&transport=websocket", {}, (socket) => {
    socket.on("open", () => {
      socket.send(JSON.stringify([
        "join_room",
        { roomId: __ENV.ROOM_ID, user: { name:"PerfUser", avatar:"🤖" }, roomType:"private", deviceId:"perf-device" }
      ]));
    });

    socket.on("message", (data) => {
      check(data, { "received message": (d) => d.length > 0 });
    });

    sleep(30);
    socket.close();
  });

  check(res, { "connected": (r) => r && r.status === 101 });
}
```

---

## 6. Database Test Cases

### PostgreSQL / Prisma

| TC-ID | Module | Scenario | Test Steps | Expected | Type |
|-------|--------|----------|------------|----------|------|
| DB-001 | User | Create user profile | `userService.getOrCreateProfile(deviceId, name, avatar)` | User record created, uuid PK assigned | CRUD |
| DB-002 | User | Idempotent upsert | Call twice with same deviceId | Single record, name/avatar updated | Idempotency |
| DB-003 | User | Null deviceId rejected | `getOrCreateProfile(null, ...)` | Throw / return null | Constraint |
| DB-004 | Stats | Write session stat | `statsService.writeSessionStat(deviceId, {...})` | SessionStat record inserted | CRUD |
| DB-005 | Stats | Concurrent writes same user | 10 parallel writeSessionStat calls | All 10 records inserted (no lost updates) | Concurrency |
| DB-006 | Stats | Leaderboard aggregation | Insert 5 users with different win counts | Leaderboard returns correct rank order | Aggregate |
| DB-007 | Stats | Weekly leaderboard window | Insert old (8d ago) and new (1d ago) stats | Only new stats counted | Time-window |
| DB-008 | XP | Award XP and level up | `userService.awardXp(deviceId, stats)` | XP updated, level incremented at threshold | Business rule |
| DB-009 | XP | XP accumulated correctly | Multiple awardXp calls | XP monotonically increases | Data integrity |
| DB-010 | Achievement | Seed achievements | `achievementService.seedAchievements()` | All defined achievements in DB | Seed |
| DB-011 | Achievement | Award once only | `checkAndAward` twice with same condition | Only 1 PlayerAchievement record (unique constraint) | Duplicate prevention |
| DB-012 | Achievement | Soft delete check | Any soft-deleted records? | Verify no orphaned data | Data integrity |
| DB-013 | Transaction | Stats write fails mid-loop | Simulate DB error mid-persistGameOver | Earlier writes committed; no partial state | Rollback |
| DB-014 | Index | Stats query uses index | `EXPLAIN ANALYZE` on leaderboard query | Index scan, no seq scan on large dataset | Index usage |
| DB-015 | Constraint | Duplicate achievement FK | Insert same userId + achievementId twice | Prisma unique constraint error | Constraint |

### Redis

| TC-ID | Scenario | Steps | Expected |
|-------|----------|-------|----------|
| DB-016 | Room saved correctly | `saveRoom(room)` → `getRoomById(id)` | Retrieved room matches saved | 
| DB-017 | Room TTL prevents stale data | Create room, wait TTL, fetch | null returned |
| DB-018 | Concurrent room updates | 2 sockets update same room simultaneously | No lost writes (use Redis transactions/WATCH) |
| DB-019 | Public rooms SET maintained | Join public, leave public | Set reflects current state |
| DB-020 | Redis key format consistent | Inspect keys | All `room:{uuid}`, no injection |

---

## 7. Frontend Test Cases

### UI Validation

| TC-ID | Component | Scenario | Steps | Expected | Priority |
|-------|-----------|----------|-------|----------|----------|
| FE-001 | Login | Empty name rejected | Submit with blank name | Validation error, no join | P0 |
| FE-002 | Login | Whitespace-only name rejected | Name = "   " | Trimmed to empty, rejected | P0 |
| FE-003 | Login | Name max length enforced | 256-char name | Clamped/rejected at UI level | P1 |
| FE-004 | WaitingRoom | Player list updates in real-time | Second player joins | New player appears without refresh | P0 |
| FE-005 | GameBoard | Number grid renders all 0–100 | On game start | 101 clickable number cells | P0 |
| FE-006 | GameBoard | Selected number highlighted | Click 42 | Cell 42 highlighted; others not | P0 |
| FE-007 | GameBoard | Submit disabled after selection | Already submitted | Number grid disabled/greyed | P0 |
| FE-008 | Overlay | Step dots match step count | Watch overlay | 4 dots, advance on each step | P1 |
| FE-009 | Overlay | Click outside advances step | Click backdrop | Step advances | P2 |
| FE-010 | RoundHistory | New round appended to history | Complete round | History grows by 1 row | P1 |
| FE-011 | Navbar | User avatar shown when in room | Join room | Avatar + name in top-right | P1 |
| FE-012 | Responsive | Mobile: number grid scrollable | Viewport 375px | Grid scrollable, no overflow | P1 |
| FE-013 | Responsive | Tablet layout | Viewport 768px | Two-column layout where applicable | P2 |
| FE-014 | Accessibility | Buttons have aria-labels | Inspect DOM | All icon-only buttons have aria-label | P2 |
| FE-015 | Accessibility | Focus order logical | Tab navigation | Focus moves in reading order | P2 |
| FE-016 | Browser | Chrome: WebRTC works | Join voice in Chrome | P2P audio established | P1 |
| FE-017 | Browser | Firefox: WebRTC works | Join voice in Firefox | P2P audio established | P1 |
| FE-018 | Browser | Safari: WebRTC permission UX | Join voice in Safari | Prompts correctly for mic | P1 |
| FE-019 | Error boundary | Component throws | Force JS error in child | Error boundary catches, shows fallback | P1 |
| FE-020 | State | Hard refresh preserves user | Refresh mid-game | Login re-hydrates, no crash | P0 |

---

## 8. Integration Tests

### Service-to-Service

| TC-ID | Services | Scenario | Steps | Expected |
|-------|----------|----------|-------|----------|
| INT-001 | game.js → timerService | Timer clears when all submit | All submit at T+5s | `clearTimer` called, no expiry event | 
| INT-002 | game.js → gameManager | evaluateRound result applied | Call resolveRound | game state updated in Redis | 
| INT-003 | game.js → achievementService | Achievement checked after game | Complete game | `checkAndAward` called with correct stats | 
| INT-004 | lobby.js → roomManager | Join room persists to Redis | `join_room` event | `getRoomById` returns room with new user | 
| INT-005 | voice.js → socket.io | Signaling relay | Client A sends voice_offer | Client B receives with correct `from` | 
| INT-006 | Socket.IO → Redis adapter | Event reaches all nodes | Multi-process with Redis adapter | All instances receive room events | 

### Frontend-to-Backend

| TC-ID | Scenario | Steps | Expected |
|-------|----------|-------|----------|
| INT-007 | Full game flow E2E | 3 browser tabs: join → play → game over | All events synchronised across tabs | 
| INT-008 | Voice chat E2E | 2 tabs join voice, speak | Audio received on both ends | 
| INT-009 | Chat E2E | Tab A sends message | Tab B sees message with avatar | 
| INT-010 | Achievement toast E2E | Complete game triggering achievement | Achievement toast appears on correct tab only | 

---

## 9. Regression Suite

### Smoke Tests (run on every deploy, < 5 min)

| ID | Test | Critical Path |
|----|------|---------------|
| S-001 | App loads without JS errors | Yes |
| S-002 | Login screen renders | Yes |
| S-003 | Create room, second player joins | Yes |
| S-004 | Host starts game | Yes |
| S-005 | Submit number, get acknowledgement | Yes |
| S-006 | Round result overlay appears | Yes |
| S-007 | Timer counts down | Yes |
| S-008 | Game over screen shown | Yes |
| S-009 | `/api/health` returns 200 | Yes |
| S-010 | Socket connects successfully | Yes |

### Sanity Tests (run on major releases)

| ID | Test |
|----|------|
| SAN-001 | All game rules (duplicate, void, exact match, elimination) work correctly |
| SAN-002 | Voice chat: join, mute, peer hearing each other, leave |
| SAN-003 | Room code generation and lookup |
| SAN-004 | XP + achievement award at game end |
| SAN-005 | Timer expiry auto-resolves round |
| SAN-006 | WaitingRoom → GameBoard transition preserves voice |
| SAN-007 | Restart game from game-over screen |
| SAN-008 | Public room matchmaking |

### Regression Candidates (run weekly)

All Smoke + Sanity + TC-038 to TC-053 (rules engine) + SEC-001 to SEC-010 + all API tests.

---

## 10. Automation Scripts

### Cypress E2E — Critical Game Flow

```js
// cypress/e2e/gameFlow.cy.js
describe("Numwit — Full Game Flow", () => {
  const origin = "http://localhost:3000";

  it("TC-AUTO-001: Two players complete a round", () => {
    // Player 1 (host)
    cy.visit(origin);
    cy.get("[data-testid=name-input]").type("Alice");
    cy.get("[data-testid=avatar-btn]").first().click();
    cy.get("[data-testid=play-btn]").click();
    cy.get("[data-testid=create-room-btn]").click();
    cy.url().then((url) => {
      const roomId = url.split("/").pop();

      // Player 2 joins via invite link
      cy.task("openNewTab", `${origin}/${roomId}`).then((tab) => {
        cy.wrap(tab).within(() => {
          cy.get("[data-testid=name-input]").type("Bob");
          cy.get("[data-testid=avatar-btn]").eq(1).click();
          cy.get("[data-testid=play-btn]").click();
        });
      });

      // Host starts game
      cy.get("[data-testid=start-game-btn]").should("not.be.disabled").click();

      // Both players in game
      cy.get("[data-testid=round-display]").should("contain", "Round 1");
      cy.get("[data-testid=timer]").should("be.visible");

      // Alice submits
      cy.get("[data-testid=number-btn-50]").click();
      cy.get("[data-testid=submitted-display]").should("contain", "50");

      // Wait for round result overlay (Bob auto-submits via timer or manual)
      cy.get("[data-testid=round-result-overlay]", { timeout: 35000 }).should("be.visible");
      cy.get("[data-testid=round-result-overlay]").should("contain", "Round 1 Result");
    });
  });

  it("TC-AUTO-002: Non-host cannot start game", () => {
    cy.visit(origin);
    // Login as non-host (simulate via localStorage hack)
    cy.window().then((win) => {
      win.localStorage.setItem("80Percentile-user", JSON.stringify({ name:"Eve", avatar:"👾" }));
    });
    // Intercept and send start_game as non-host
    cy.window().its("socket").then((socket) => {
      socket.emit("start_game", { roomId: "fake-room-id", settings: {} });
    });
    cy.get("[data-testid=floating-alert]", { timeout: 3000 })
      .should("contain", "Only the host can start");
  });

  it("TC-AUTO-003: Timer expiry auto-resolves round", () => {
    // Start game with 20s timer, do not submit, wait for expiry
    cy.get("[data-testid=timer]").should("contain", "20");
    cy.get("[data-testid=round-result-overlay]", { timeout: 25000 }).should("be.visible");
  });
});
```

### Cypress — Voice Chat

```js
// cypress/e2e/voiceChat.cy.js
describe("Voice Chat", () => {
  it("TC-AUTO-004: Join voice shows live badge", () => {
    cy.visit("http://localhost:3000");
    // Login and join room setup omitted for brevity
    cy.get("[data-testid=voice-join-btn]").click();
    // Browser mic permission auto-granted in Cypress with --use-fake-ui-for-media-stream
    cy.get("[data-testid=voice-live-badge]").should("be.visible");
  });

  it("TC-AUTO-005: Mute button toggles state", () => {
    cy.get("[data-testid=voice-mute-btn]").click();
    cy.get("[data-testid=voice-muted-banner]").should("be.visible");
    cy.get("[data-testid=voice-mute-btn]").click();
    cy.get("[data-testid=voice-muted-banner]").should("not.exist");
  });

  it("TC-AUTO-006: Mic denied shows error", () => {
    // Set browser permission to deny
    cy.stub(window.navigator.mediaDevices, "getUserMedia").rejects(
      Object.assign(new Error(), { name: "NotAllowedError" })
    );
    cy.get("[data-testid=voice-join-btn]").click();
    cy.get("[data-testid=voice-error-msg]").should("contain", "Microphone access denied");
  });
});
```

### Playwright — Cross-Browser

```js
// playwright/voiceCross.spec.js
const { test, expect, chromium, firefox } = require("@playwright/test");

test.describe("Cross-browser voice chat", () => {
  for (const browserType of [chromium, firefox]) {
    test(`Voice panel renders in ${browserType.name()}`, async () => {
      const browser = await browserType.launch({
        args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
      });
      const page = await browser.newPage();
      await page.goto("http://localhost:3000");
      // Login steps omitted
      await page.click("[data-testid=voice-join-btn]");
      await expect(page.locator("[data-testid=voice-live-badge]")).toBeVisible({ timeout: 5000 });
      await browser.close();
    });
  }
});
```

### Artillery — Socket Load Test

```yaml
# perf/socket-load.yml
config:
  target: "http://localhost:5000"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Load"
  engines:
    socketio:
      transports: ["websocket"]

scenarios:
  - name: "Game round simulation"
    engine: socketio
    flow:
      - emit:
          channel: "join_room"
          data:
            roomId: "{{ $randomString() }}"
            user: { name: "LoadUser", avatar: "🤖" }
            roomType: "private"
            deviceId: "{{ $randomUUID() }}"
      - think: 2
      - emit:
          channel: "send_number"
          data:
            roomId: "{{ roomId }}"
            no: "{{ $randomInt(0, 100) }}"
      - think: 30
```

---

## 11. Edge Cases Catalogue

### Module: Game Rules Engine (20+ edge cases)

| EC-ID | Edge Case | Input | Expected Behaviour |
|-------|-----------|-------|-------------------|
| EC-001 | All players submit 0 | [0,0,0] 3 players | round_void (all duplicate) |
| EC-002 | All submit 100 | [100,100,100] | round_void |
| EC-003 | Target is 0 (all submit 0, one submits 1) | [0,0,1] → valid=[1] | Player with 1 wins, target=0×multiplier=0 |
| EC-004 | Floating-point target: avg=33.333... | [0,50,50] dedup → [0] | target=0×0.8=0, winner picks 0 |
| EC-005 | Exact match at boundary: number=0, target=0 | Wins with exact match | exactMatch=true, non-winners +2 |
| EC-006 | 3 players, all unique, one hits target exactly | winner=target | exactMatch=true |
| EC-007 | Co-winners with exactMatch | Two players equidistant and both hit target | Only one can be exact; first in array wins |
| EC-008 | Cycle: 100 vs 100 (2 players) | [100,100] | round_void (same number) |
| EC-009 | Cycle: non-cycle number 50 vs 50 | [50,50] | round_void |
| EC-010 | Player at threshold-1 wins round | points=4, wins | Not eliminated (stays at 4) |
| EC-011 | Player at threshold-1 loses round | points=4, +1 | Eliminated at 5 |
| EC-012 | All players eliminated simultaneously | Points all hit threshold | Both newly eliminated, game_over triggered |
| EC-013 | 2-player, one already eliminated | 1 active player | Game over immediately |
| EC-014 | Submission with float | no=42.9 → Math.round → 43 | Rounded server-side |
| EC-015 | Submission with negative | no=-5 → Math.max(0,-5)=0 | Clamped to 0 |
| EC-016 | Target multiplier=1.0: target=average | All players equidistant when average hits exactly | All co-win |
| EC-017 | Single player submits (others eliminated) | Only 1 submission | That player wins automatically |
| EC-018 | Round where all become winners | All equidistant from target | All win, 0 penalty for anyone |
| EC-019 | Game settings passed to round 2 but not included in next_round emit | Settings missing from round 2 data | Client uses cached settings from round 1 |
| EC-020 | Timer fires AND all-submit happens in same ms | Race: both resolveRound calls | status=COMPLETED blocks second resolve |
| EC-021 | Host leaves during game | hostSocketId socket disconnects | Game continues; host badge removed |
| EC-022 | All players disconnect during 5s delay | Room empty during setTimeout | next_round emits to empty room (no-op) |

### Module: Voice Chat (20+ edge cases)

| EC-ID | Edge Case | Expected |
|-------|-----------|----------|
| EC-023 | ICE candidate arrives before remoteDescription | Buffered in pendingIce, flushed on setRemoteDescription |
| EC-024 | Both peers send offer simultaneously (glare) | signalingState guard prevents invalid state transition |
| EC-025 | Peer disconnects during ICE gathering | onconnectionstatechange→failed, destroyPeer called |
| EC-026 | User closes tab without clicking Leave | socket.disconnect fires, removeFromVoice cleans up |
| EC-027 | AudioContext suspended (browser policy) | Resume on user gesture; stream still functional |
| EC-028 | Multiple rapid join/leave cycles | Peer connections torn down and rebuilt cleanly |
| EC-029 | 3rd peer offer arrives before 2nd peer connected | createPC called for 3rd peer independently |
| EC-030 | Mute state not synced on late join | New joiner doesn't receive mute state of existing peers |
| EC-031 | Same player voice_ready twice (page reload) | Server removes old socket, adds new |
| EC-032 | Network flip during voice call | ICE restart attempts reconnection |
| EC-033 | Browser with AudioContext blocked | createSpeakingDetector catches error, returns no-op |
| EC-034 | VoiceProvider unmounts mid-call | Cleanup runs, all tracks stopped, peers destroyed |
| EC-035 | WaitingRoom → GameBoard transition during ICE | useEffect cleanup not called (VoiceProvider stays mounted) |
| EC-036 | > 8 players in voice (mesh N²) | 8 players = 28 peer connections; performance degrades |
| EC-037 | Symmetric NAT without TURN | Connection fails silently; need TURN for production |
| EC-038 | setLocalDescription throws (codec mismatch) | Try/catch logs error, connection not established |
| EC-039 | addIceCandidate race on disconnected PC | .catch(() => {}) swallows; no crash |
| EC-040 | Speaking detector: AudioContext GC | cancelAnimationFrame in cleanup prevents dangling RAF |
| EC-041 | Empty peers object on leave | forEach on empty object; no error |
| EC-042 | voice_offer to non-existent socket (peer left) | io.to(to).emit is a no-op for unknown socket ID |

### Module: Socket.IO / Networking

| EC-ID | Edge Case | Expected |
|-------|-----------|----------|
| EC-043 | Player submits during round_void replay window | Numbers map cleared; submit counts as new submission |
| EC-044 | Socket reconnects with new socket.id mid-game | Old ID not in room.users; new join required |
| EC-045 | Two start_game events in rapid succession | Second createGameData returns null (room.game already set) |
| EC-046 | send_number with no user object | no is still processed; user.name undefined in log only |
| EC-047 | join_room for full room | Server should enforce max players (currently uncapped) |
| EC-048 | Room ID injection: `room:all` | getRoomById prepends `room:`, reads `room:room:all` → null |
| EC-049 | 5-second delay, server restarts mid-delay | setTimeout cancelled; no next_round emitted | 
| EC-050 | Emitting to disconnected room | io.to(roomId).emit is no-op; no error |

---

## 12. Bug Hunting — Likely Defects

### Race Conditions

| BUG-ID | Category | Description | Reproduction | Risk |
|--------|----------|-------------|--------------|------|
| BUG-001 | Race Condition | **Timer fires AND all-submit at exact same ms** — `resolveRound` could be called twice | Have players submit at T-1ms before expiry | **Critical** — duplicate round_result emitted |
| BUG-002 | Race Condition | **5s delay + restart_game** — host restarts during the 5s setTimeout; next_round fires into new game state | Host clicks Restart at T+3s after round ends | **High** — stale setTimeout overwrites new game |
| BUG-003 | Race Condition | **ICE glare** — both voice peers send offers simultaneously | Both join voice within same 50ms window | **Medium** — one connection may fail |
| BUG-004 | Race Condition | **Concurrent room saves** — two events both call saveRoom without Redis WATCH | Both call saveRoom simultaneously | **High** — one write overwrites the other |
| BUG-005 | State Sync | **VoiceContext speaking state after peer leaves** — speaking state update fires after destroyPeer | Peer speaks and leaves simultaneously | **Low** — orphaned speaking state in peers map |

### Memory Leaks

| BUG-ID | Category | Description | Reproduction | Risk |
|--------|----------|-------------|--------------|------|
| BUG-006 | Memory Leak | **timerService Map never shrinks if clearTimer not called** — abandoned rooms leave timers running | Create room, never start game, never join again | **High** — memory grows indefinitely |
| BUG-007 | Memory Leak | **voiceRooms Map on server** — voice room never cleaned if socket disconnects before voice_ready | Connect socket, never call voice_ready, disconnect | **Low** — cleanup only runs if `_voiceRoomId` is set |
| BUG-008 | Memory Leak | **AudioContext in createSpeakingDetector** — if cleanup not called, AudioContext remains open | Mount/unmount VoiceProvider rapidly | **Medium** — browser AudioContext limit hit |
| BUG-009 | Memory Leak | **RAF loop without cleanup guard** — if component remounts before RAF is cancelled | Rapid WaitingRoom→GameBoard transitions | **Low** — RAF cancellation in cleanup covers this |

### Concurrency / State Corruption

| BUG-ID | Category | Description | Reproduction | Risk |
|--------|----------|-------------|--------------|------|
| BUG-010 | State Corruption | **points object mutated in-place** — `computePenalties` uses `Object.assign` correctly but Redis serialises by value | Verify Redis GET → JSON.parse → modify → JSON.stringify cycle | **Medium** — verify no reference sharing |
| BUG-011 | State Corruption | **eliminatedPlayers array grows across void rounds** — sendNumber after void checks eliminatedPlayers from stale game state | Player eliminated, round voids, they submit again | **High** — eliminated player may submit in void round |
| BUG-012 | Concurrency | **Two players join with same name** — no uniqueness check on room join | Two tabs, same name, same room | **Low** — cosmetic; socketId distinguishes them |
| BUG-013 | Concurrency | **chat_rate_limited timer leaks** — `setTimeout(() => setRateLimited(false), 3000)` — if component unmounts during 3s, setState on unmounted component | Leave room during rate-limited window | **Low** — React 18 no-ops unmounted setState |

### Data Integrity

| BUG-ID | Category | Description | Reproduction | Risk |
|--------|----------|-------------|--------------|------|
| BUG-014 | Data Integrity | **winHistory / exactMatchHistory never tracked on game object** — persistGameOver reads `game.winHistory[mySocketId]` but these fields are never written to `game` | Complete any game | **High** — win count always 0 in DB |
| BUG-015 | Data Integrity | **mute state not synced on new joiner** — `voice_ready` sends existing peer IDs but not their mute state | Join voice when peers are already muted | **Medium** — joiner sees muted peers as unmuted |
| BUG-016 | Data Integrity | **gameSettings not included in round 2+ next_round** — round 2 `next_round` emit omits `gameSettings` key | Play round 2+ | **High** — client targetMultiplier resets to default in footer |

### Hidden Edge Cases

| BUG-ID | Description | Reproduction | Risk |
|--------|-------------|--------------|------|
| BUG-017 | **Room code collision** — `codeService` may generate the same 6-char code for different rooms | Create thousands of rooms | **Medium** — second room lookup would resolve to wrong room |
| BUG-018 | **Public room stays in SET after game ends** — `removeFromPublicSet` called only on `start_game`, not on room destruction | Abandon public room, it stays matchmakeable | **Medium** — players join a ghost room |
| BUG-019 | **GameBoard renders before game data arrives** — brief flash of "Round —" | Slow network | **Low** — fixed with `!= null` check, but flash still possible |
| BUG-020 | **AchievementToast `addToast` recreated each render** — each socket event closes over a different `addToast` instance | Rapid achievement events | **Low** — moved inside useEffect, fixed in cleanup |

---

## 13. Risk Matrix

| Risk Area | Likelihood | Impact | Overall | Mitigation |
|-----------|-----------|--------|---------|------------|
| Timer race: double resolve | High | Critical | 🔴 Critical | Add `if game.status === COMPLETED return` guard at top of resolveRound |
| Redis concurrent save corruption | High | High | 🔴 Critical | Use Redis transactions (MULTI/EXEC) or optimistic locking |
| winHistory never written → 0 wins in DB | High | High | 🔴 Critical | Track wins in `evaluateRound` → `result.updatedGame` |
| 5s delay + restart race | Medium | High | 🟠 High | Clear pending setTimeout on restart_game |
| CORS `*` in production | High | High | 🟠 High | Restrict to known origins via env var |
| Room flooding (no max players) | Medium | High | 🟠 High | Add max player cap in join_room handler |
| timerService memory leak | Medium | High | 🟠 High | Add Redis TTL on rooms; periodic Map audit |
| mute state not synced on join | High | Medium | 🟡 Medium | Include mute map in `voice_existing_peers` payload |
| gameSettings missing from round 2 | High | Medium | 🟡 Medium | Include gameSettings in all next_round emits |
| Public room ghost entries | Medium | Medium | 🟡 Medium | Cleanup public SET on room destroy/disconnect |
| TURN absent: 5% users no audio | Low | High | 🟡 Medium | Add TURN server before production |
| XSS in player name (React escapes) | Low | Critical | 🟡 Medium | Already mitigated by React; add CSP header |
| DeviceId guessing (IDOR stats) | Low | Low | 🟢 Low | UUIDv4 space is effectively unguessable |

---

## 14. Test Coverage Matrix

| Module | Unit | Integration | E2E | API | Security | Performance | Coverage Target |
|--------|------|-------------|-----|-----|----------|-------------|-----------------|
| gameRules.js | ✅ 34 tests | ✅ | — | — | ✅ injection | — | **95%** |
| gameManager.js | ✅ 6 tests | ✅ | — | — | — | — | **90%** |
| timerService.js | ✅ 6 tests | ✅ | — | — | — | ✅ | **90%** |
| voice.js (server) | ✅ via integration | ✅ | — | — | ✅ spoofing | ✅ | **85%** |
| game.js handler | ✅ mocked | ✅ | ✅ | ✅ Socket events | ✅ host auth | ✅ | **90%** |
| lobby.js handler | ✅ mocked | ✅ | ✅ | ✅ | — | — | **85%** |
| VoiceContext.jsx | ✅ 14 tests | ✅ | ✅ | — | — | — | **90%** |
| VoicePanel.jsx | ✅ 10 tests | — | ✅ | — | — | — | **90%** |
| GameBoard.jsx | ✅ | — | ✅ | — | — | — | **85%** |
| NumwitRuleContext.jsx | ✅ | — | ✅ | — | — | — | **85%** |
| REST APIs | — | ✅ | — | ✅ 20 tests | ✅ 10 tests | ✅ k6 | **95%** |
| Redis layer | — | ✅ | — | — | ✅ | ✅ | **80%** |
| PostgreSQL/Prisma | — | ✅ 15 tests | — | — | ✅ | — | **80%** |
| **Overall** | | | | | | | **≥ 88%** |

---

*Generated by Senior QA Architect analysis of Numwit codebase · June 2026*
