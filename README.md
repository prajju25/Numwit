🎮 Game Flow
Event Direction Description
start_game client (host) → server Trigger to begin game
game_started server → all clients Acknowledge start and broadcast round 1
next_round server → all clients Start next round (new input expected)
submit_number client → server Player submits a number (0–100)
number_received server → client Acknowledge submission
waiting_for_players server → client Notify player to wait if others haven’t submitted yet

🧠 Round Evaluation
Event Direction Description
round_result server → all clients Broadcast winner, avg, target, score updates
exact_match_penalty server → all clients If player hits exact target, all others get 2 points
tie_breaker_three_players server → all clients When 3 players submit same number, winner chosen differently
two_players_left_result server → all clients Special case: 0 vs 100, 100 wins
player_eliminated server → all clients A player reached 5 points and is eliminated

🏁 Game End
Event Direction Description
game_over server → all clients Final winner declared
restart_game client → server Players want to restart
game_reset server → all clients New game started with same room

❗ Error Handling
Event Direction Description
invalid_number server → client Invalid range (not 0–100)
duplicate_submission server → client Already submitted for this round
not_in_room server → client Player not in active room
round_already_completed server → client Late submission ignored

---

UX flow
Completed:
Flow 1 (User starting the game with public room)
-- Client | Login (User click start game) --
-- Client | RoomOverlay (Pubic) -- need to connect to public room id
-- Client - Server | "join_room" Socket event with user and roomType
-- Server | Adds user to public room and stores in redis
-- Server - Client | Triggers "room_update" event
-- Client | Waiting Room - user waits untill min 3 players are there -- once 3 players join Game starts
-- Client | GameBoard - check Flow 3 for gameboard flows
Flow 2 (User starting the game with public room)
-- Client | Login (User click start game)
-- Client | RoomOverlay (Private) -- Generate room id
-- Client - Server | "join_room" SOcket event with user and roomID
-- Server | Adds user to room and stores in redis
-- Server - Client | Triggers "room_update" event
-- Client | Waiting Room - user waits untill min 3 players are there -- once 3 players join Game starts
-- Client | GameBoard - check Flow 3 for gameboard flows

In Progress:
Flow 3 (On Game Start)
-- Client | GameBoard - start_game client (host) → server Trigger to begin game. game starts with 3 rounds.
-- Server - CLient | game_started server → all clients Acknowledge start and broadcast round 1. random turns for round 1 until all players gets 1 turn. Next round the turn goes as per the round 1 order. need to maintain scoring points of each user
