# NumWit — Growth Plan: 0 to 10,000 Players
*Authored by: Growth Strategy Review · June 2026 · domain and status updated 15 Oct 2026*

> **Status:** this document is the playbook — *why* each idea works. What's done and what's
> next is tracked in **[EXECUTION_ROADMAP.md](EXECUTION_ROADMAP.md)**. Items marked ✅ below
> are already live at https://numwit.prajvex.com.

---

## Pre-Analysis: What Kind of Game Is This, Really?

Before strategy, we need brutal clarity on what NumWit actually is — because the wrong positioning kills growth before it starts.

NumWit is a **Keynesian Beauty Contest** — a game of recursive social prediction. You're not picking the best number. You're predicting what others will predict, then undercutting that by 20%. It rewards psychological insight over math. The player who wins isn't the smartest — it's whoever best reads the room.

This makes NumWit a **social deduction game dressed as a math game**. That's a massive positioning opportunity and the source of every viral hook in this plan.

**Comparable games and their growth mechanisms:**
- **Wordle** — Daily constraint + shareable result card = 2M players in 3 months. Zero budget.
- **Among Us** — Social conflict post-game (debate, accusation, betrayal) = organic stream content.
- **GeoGuessr** — "I'll do better next time" learning loop + bragging rights on specific rounds.
- **Skribbl.io** — One link, no download, play immediately with friends = near-zero invite friction.
- **The Password Game** — Absurdist difficulty = rage-share ("you have to try this").

NumWit's hidden viral opportunity: **the "I thought I was smart" moment**. Players who lose in round 1 don't know why. When they realize the game punishes naive reasoning, they experience a genuine intellectual revelation — which is one of the most shareable emotional states that exists.

---

## Section 1: Positioning

### One-Sentence Description
**"NumWit is the real-time multiplayer game where the smartest move is predicting how dumb everyone else will play."**

Variants for different contexts:
- Reddit/casual: *"A browser game where picking 50 is usually the worst choice."*
- Twitter: *"I've been wrong 8 times in a row and I still think I understand this game."*
- Discord: *"Like Among Us but the betrayal is mathematical."*
- Product Hunt: *"A multiplayer psychology game where the winner isn't the cleverest — it's whoever best reads the room."*

### What Makes It Unique

Three things no direct competitor combines:

1. **The mechanic rewards meta-cognition, not skill.** Most games reward knowing more. NumWit rewards knowing what others think others think. First-time players lose to this. Experienced players become obsessed by it.

2. **Instant, no-friction play.** No download, no account, no waiting. A 6-character code gets a friend into your room in 10 seconds. This is rarer than it sounds — most browser games still require signup.

3. **Solo mode with intelligent bots.** You can learn the game alone before embarrassing yourself publicly. Adaptive bots simulate player psychology. No other game in this category has this.

### Why Would Someone Share It?

The share impulse comes from one of three states:

**State A — Humiliation (most common):** "I just picked 50 and came last. The target was 26. Someone explain." This is the Wordle-equivalent moment. It's specific, explainable, and invites group participation.

**State B — Intellectual triumph:** "I won 4 rounds in a row because I understood everyone else would anchor on 50, so I picked 32." Players who crack the meta want an audience to explain it to.

**State C — Social chaos:** "We just had a round where everyone picked 37, so the target was also 37, and three people got eliminated simultaneously." Absurd outcomes are inherently shareable.

**Recommendation:** Design the share-results card around State A. Show the round where the player was most wrong, not their wins. Vulnerability is more viral than bragging.

---

## Section 2: Viral Mechanics

### Features to Add (Ranked by Viral Leverage)

**1. Shareable Result Card (highest priority)** — ✅ *Image card redesigned (Oct 2026). Still to do: the Wordle-style text version below → Roadmap Sprint 1; titles → Sprint 2.*

The current share button needs to produce a visually distinct, screenshot-worthy card showing:
- Your final placement with a personalized title ("The Overthinker", "The Mind Reader", "The Lucky Fool")
- Your most memorable round ("Round 3: You picked 72. Target was 31. You're why this game exists.")
- The invite link/code
- A subtle NumWit watermark

Design it like a Wordle result: compact, emoji-driven, instantly readable in a Twitter/Discord screenshot. Example:

```
🧠 NumWit · 4-player game
📍 Placement: 2nd of 4

Round 1: 🎯 50 → Target 28 (-22) 
Round 2: 🎯 33 → Target 30 (+3) 
Round 3: 🎯 29 → Target 31 🏆 WON
Round 4: 🎯 27 → Target 26 🏆 WON

🏅 "The Comeback Kid"
Play: numwit.prajvex.com · Code: MNDK42
```

**2. Personalized Post-Game Titles** — ✅ *Shipped Oct 2026 (Sprint 2)*

Award a title based on play style this session:
- **"The Contrarian"** — consistently picked the lowest number
- **"The Anchor"** — picked near 50 in 3+ rounds
- **"The Mind Reader"** — won via exact match
- **"The Last Romantic"** — picked 100 three times
- **"The Mathematician"** — won the most rounds without ever winning the game
- **"The Chaos Agent"** — triggered two void rounds
- **"The Lone Wolf"** — won 1v1 duel from behind

These titles are players' identities in the game. They will screenshot them. They will argue about them in Discord. This is free marketing.

**3. Daily Challenge Mode** — ⬜ *Roadmap Sprint 5*

A fixed daily scenario — same starting numbers, same elimination threshold — for all players globally. One result to share. Creates the Wordle effect: "Did you do today's NumWit?" The server generates a daily seed at midnight; everyone who plays that seed gets a comparable result card. Shareable, repeatable, habitual.

**4. Rematch Request System** — ⬜ *Roadmap Sprint 3*

After game over, a "Rematch" button sends a socket push to everyone who was in the game. If 2+ players vote rematch within 60 seconds, the room restarts instantly. This is the Among Us loop — the game doesn't end, it just resets the stakes. Dramatically increases session length.

**5. Spectator Mode** — ⬜ *Roadmap "Later"*

Let eliminated players — and anyone with the room link — watch the game in real time. Spectators see all submitted numbers revealed in real time (unlike active players who submit blind). This creates:
- A way to learn the game (observe, then play)
- Content for streamers ("Watch me predict what these idiots will pick")
- A reason to share the room link with people who aren't currently playing

**6. Invite-to-Room Push from Winner Screen** — ✅ *Shipped Oct 2026 as "Challenge friends" (Sprint 2)*

After game over, every player sees a button: "Challenge a friend — send them your room code." Pre-populate a shareable message with their personalized title. The winner sharing feels like bragging. The loser sharing feels like seeking revenge. Both are viral.

**7. Public Game Feed (Social Proof)** — ⬜ *Roadmap "Later"*

On the landing page, add a live feed of recent games:
```
🎮 A 6-player game just ended · Winner: "The Contrarian" with 3 round wins
🎮 Bot game started · 4 players looking for opponents  
🎮 Private room MNDK42 · 2/8 players · Open
```

This shows the game is alive, creates FOMO, and nudges solo visitors toward joining.

**8. "Invite 2 Friends to Unlock Private Room" Gate**

Private rooms are fully functional — make them feel slightly exclusive. Add a soft gate: first private room is free, but a persistent invite link (your personal code) requires sharing a referral. This creates a referral loop without being coercive.

---

## Section 3: Launch Strategy

### Product Hunt Launch

**Target:** Top 5 on launch day, "Product of the Day" in Games category.

**Timing:** Tuesday or Wednesday, midnight PST. Never launch on Monday (overwhelmed) or Friday (low traffic).

**Pre-launch (3 weeks before):**
- Build a hunter network: reach out to top Product Hunt hunters in the games/indie category. Ask them to hunt your product (not just upvote). DM 10-15 hunters.
- Create a "Coming Soon" page on PH to collect followers who get notified on launch.
- Tease in indie game communities (r/IndieGaming, Indie Hackers) without linking directly.
- Prepare 5 GIFs showing the key gameplay moments: the void round, the exact match reveal, the 1v1 duel cycle, a close 3-player finish, a comeback.

**Launch day assets:**
- Tagline: *"The browser game where picking 50 is probably a mistake."*
- Description (250 words max): Open with the behavioral economics angle ("This is a Keynesian Beauty Contest"), explain the rules in 3 bullet points, note it's free/no-download/instant.
- First comment (post immediately after launch): "As someone who built this — I lost 14 times in a row before I understood my own game. The mechanic is genuinely counterintuitive. Ask me anything."
- Gallery: 5 screenshots + 1 GIF of a round result reveal.

**Day-of promotion:**
- Post in Indie Hackers the morning of launch.
- Post in relevant Discord servers (game dev, indie game, browser games) with PH link.
- Email your personal network — not to beg for upvotes, but to say "I shipped a game, would love 5 minutes of your time to play and give feedback."
- Never ask directly for upvotes. Ask for "feedback" — people who engage genuinely upvote naturally.

**Target:** 200 upvotes, 30+ comments = strong launch.

### Reddit Launch

Reddit is NumWit's highest-leverage organic channel. The game is genuinely interesting to multiple subreddits.

**Primary targets:**

**r/WebGames (350K members)** — This is the home base. Post: "I built a browser game based on a real economics concept — the Keynesian Beauty Contest. No download, instant play. Would love feedback." This is a direct ask for players. Expect 50-200 genuine players from one post if it hits front page.

**r/IndieGaming (370K members)** — Post a devlog-style write-up: "6 months building a multiplayer browser game. Here's what the actual hard part was." Include gameplay GIF. Developers and gamers both upvote these. Do not post the game link prominently — mention it casually. People click the profile.

**r/gamedev (620K members)** — Technical post: "How I implemented the 'Keynesian Beauty Contest' mechanic and why it required a server-authoritative architecture." Developers will play the game to understand what you built.

**r/math and r/behavioral_econ** — Frame as an interactive demonstration: "I turned the Keynesian Beauty Contest into a live multiplayer game. You can play it right now. Curious what subreddit readers score vs the general public." This is irresistible to the audience.

**r/SocialExperiment** — Post results from a large public game: "I ran a 60-person game of my Keynesian Beauty Contest browser game. Here's what the data showed." Include charts of actual submitted numbers.

**r/CasualGaming and r/pcgaming** — Simpler angle: "Made a free multiplayer browser game for playing with friends. Takes 5 minutes, no account needed."

**Rules:**
- One subreddit per week. Never post the same content twice.
- Read each subreddit's rules about self-promotion first.
- Reply to every comment within the first 2 hours — Reddit algo rewards engagement.

### Hacker News

**Show HN post:** "Show HN: NumWit – a multiplayer Keynesian Beauty Contest game [browser, free]"

The HN description should be technical but accessible:
> "Built a real-time multiplayer game based on the Keynesian Beauty Contest. Players simultaneously pick 0-100, the target is 80% of the average, closest wins. The interesting part: the Nash equilibrium is 0, but players who know this lose to players who know that others know this. Stack: Node.js/Socket.IO/Redis. No account required."

**Timing:** Monday morning 9am EST.
**Expected outcome:** If it hits front page, expect 1,000-5,000 visitors in 24 hours. HN audience will play it analytically, post strategy discussions in comments, and share with technically-minded friends — your highest-quality early users.

**Follow-up post (2 months later):** "Show HN: What I learned from 10,000 games of my Keynesian Beauty Contest — the data." This is the data post after you have real analytics. HN loves data retrospectives.

### Discord Community

**Phase 1 — Find the rooms (weeks 1-4):**
Don't build your own Discord yet. Infiltrate existing relevant servers first.

Servers to join and engage in:
- **Math/game theory servers** — post the game as a demonstration of a concept
- **Indie game dev servers** — share as a dev looking for playtesters
- **Party game servers** (Jackbox, Skribbl.io communities) — "Looking for people to test a new browser game"
- **College/university servers** — "Made a game my econ professor would either love or be horrified by"
- **Streamer servers** — pitch as content for stream

**Phase 2 — Build your own server (after 500 users):**

NumWit Discord structure:
- `#welcome` — quick explanation + invite link
- `#game-codes` — players post active room codes here
- `#strategy` — discuss meta, post screenshots of big rounds
- `#results` — share result cards
- `#bugs-feedback` — direct user feedback pipeline
- Daily bot post: "Today's Daily NumWit Challenge: [code]"

**Phase 3 — The Discord flywheel:**
People join the Discord to find games. Finding games requires others in the Discord. The trick is seeding: you (the developer) and a few friends play daily games and post results. This bootstraps the "active community" feeling.

### X/Twitter Launch

**Strategy:** Quantity over quality. Post 2-3 times per day for the first 30 days. The algorithm rewards consistency.

**Account personality:** Not "official game account." Be the developer. First-person, behind-the-scenes, slightly self-deprecating. "I keep losing my own game" is more viral than "Check out NumWit."

**Pinned tweet (your home base):**
> "I built a multiplayer browser game based on a real economics experiment used by central banks.
> It's called NumWit. It's free. No download.
> Here's why picking 50 is almost always wrong: [thread]"

Post this thread with 8-10 tweets explaining the Keynesian Beauty Contest with examples. This tweet gets reshared by econ accounts, math accounts, and game accounts. It's evergreen.

**Daily posting cadence:** See Section 4.

---

## Section 4: Content Marketing

### 50 Short-Form Video Ideas (TikTok/Reels/Shorts)

**"Explain the game" series:**
1. "The game where the correct answer changes based on what everyone else thinks" (Keynesian Beauty Contest explainer)
2. "Why did everyone in this game lose by picking 50?" (show round replay)
3. "I asked 8 strangers to play my game. Here's what happened in round 1."
4. "The math behind the worst move in this game"
5. "Why smart people lose this game more than dumb people"

**Reaction / gameplay:**
6. "Watch 5 players simultaneously realize they've been playing wrong"
7. "The moment this player cracked the meta (you can see it in the numbers)"
8. "Fastest elimination ever: picked 100 in round 1"
9. "3 players left. 1 minute. The tension is real."
10. "First time playing vs. 10th time playing — the numbers don't lie"

**Educational / psychology:**
11. "This is the actual economic theory John Maynard Keynes used to describe the stock market"
12. "Why predicting what others will predict is the most valuable skill in business"
13. "The 'beauty contest' problem — and why it applies to crypto, stocks, and this game"
14. "How to win NumWit in 60 seconds: the actual strategy"
15. "Round 1 thinking vs. Round 100 thinking (the numbers are completely different)"

**Challenge format:**
16. "I challenged my entire Discord to a game. The results were embarrassing."
17. "Can an economics professor beat random college students at NumWit?"
18. "Mathematician vs. psychologist vs. gamer — who wins?"
19. "I played 100 games and tracked every number I picked. Here's the pattern."
20. "What happens when everyone in a game reads about game theory first?"

**"The void round" content:**
21. "When everyone picks the same number — this is what happens"
22. "We accidentally created a game theory paradox in real time"
23. "The round that broke NumWit (everyone picked 37)"

**Behind the scenes:**
24. "I tested my game with 100 people and here's what the data showed"
25. "Building a multiplayer game in Node.js — what I wish I knew"
26. "Day 1 vs Day 180 of building NumWit"
27. "The bug that made every win count as zero for 3 months"
28. "How the bot in my game decides what number to pick"

**Community / trends:**
29. "Reply with a number 0-100 and I'll tell you if you would win this round"
30. "Professors are using this in their behavioral economics classes"
31. "The Discord server where 200 people play this every day"
32. "Playing NumWit with my entire extended family on Christmas"
33. "My roommate is addicted to this game. I made it. Help."

**Comparative / hook:**
34. "This game is what would happen if Wordle and Among Us had a game theory baby"
35. "The browser game that makes you feel dumb in a way you enjoy"
36. "Why this is more addictive than Wordle (and requires 3+ people)"
37. "The game where the rules sound simple until round 3"
38. "I've watched 200 people play this. Round 1 is always the same. Round 5 never is."

**Absurd/funny:**
39. "Speedrunning my own elimination in NumWit" (pick 100 every round)
40. "What would happen if everyone in a game agreed to all pick 0?"
41. "The most chaotic 6-player NumWit game I've ever seen (they were all economists)"
42. "My friends think I made an easy game. They were wrong."
43. "The guy who picks 1 every single round — is it genius or trolling?"

**Tutorials:**
44. "How to destroy beginners in NumWit — the actual strategy"
45. "The counter-strategy that beats the meta — and why it works exactly twice"
46. "Why 33 is statistically the correct first pick (and why that makes it wrong)"
47. "Level 1 thinking vs Level 5 thinking in NumWit"
48. "Reading the room: how to guess what 7 strangers will pick"

**Milestones:**
49. "1,000 people played NumWit this week. Here's the most common number picked."
50. "The day NumWit hit the front page of Product Hunt"

---

### 50 Twitter/X Post Ideas

**Hooks and philosophy:**
1. "The correct answer in NumWit is whatever everyone else thinks the correct answer isn't. Which means there is no correct answer. Which means there is one correct answer."
2. "My game punishes people for thinking for themselves. Which is kind of the point."
3. "You're not picking a number. You're predicting what 7 strangers think is 80% of what they think everyone else will pick. Easy game."
4. "Keynes described the stock market using the same logic as my browser game in 1936. He wasn't wrong."
5. "Picking 50 feels safe. That's why it's almost always wrong."
6. "The most annoying thing about NumWit: the dumbest play is often correct."
7. "I lost 14 times in a row at my own game. I learned more from those 14 losses than 100 wins would have taught me."
8. "NumWit selects against expertise. The person who knows game theory loses to the person who knows that the other person knows game theory."

**Social proof / data:**
9. "10,000 games played. The most common first-round pick: 50. The players who picked 50 first: won 11% of games. Players who picked under 40: won 34%."
10. "We tracked picks across 500 games. Round 1 average: 47. Round 10 average: 28. Players learn. Then they overlearn."
11. "The game where the data is the content."
12. "Someone just hit an exact match (target = 31.2, they picked 31.2). The algorithm said it was impossible. It wasn't."

**Community / invites:**
13. "Looking for 3-7 people who want to feel briefly intelligent and then immediately humbled. Room code: [code]"
14. "My Discord has a #game-codes channel. It's been active every day for 3 months. Come feel things."
15. "Every morning I post a Daily NumWit code. Come play."
16. "Open challenge: anyone who beats me 3 times in a row gets credit in the game's changelog."

**Relatability / humor:**
17. "I keep explaining my game to people by saying 'it's like Keynesian Beauty Contest' and then watching their face."
18. "My game has voice chat. It has never once helped the person speaking."
19. "Someone filed a bug report that said 'the game is too psychologically accurate.' I closed it as working as intended."
20. "Round 1 of every NumWit game: chaos. Round 5: strategy. Round 8: philosophy."
21. "There's a void round mechanic where if everyone picks the same number, it doesn't count. We didn't think it would happen often. We were wrong."
22. "The 1v1 endgame has a rock-paper-scissors cycle: 100 beats 0, 0 beats 1, 1 beats 100. Every person I explain this to immediately wants to test it."
23. "Someone joined a public game and picked 0 every single round. They won. I have no notes."

**Behind the scenes:**
24. "Built NumWit on a $7/month server. It's handled 10,000 concurrent sessions."
25. "The bot AI in NumWit tracks the previous round's target and aims near it. Which means bots actually simulate 'I'll do better this time.' Which means bots are more relatable than I intended."
26. "The hardest technical part of NumWit wasn't the game logic. It was making 8 players all submit numbers at exactly the same time without any of them seeing each other's numbers."
27. "3 days of debugging. The bug: every win was being written to the database as zero. Every achievement based on wins: never awarded. Players won hundreds of rounds with no record. I feel things."

**Threads (write one per week):**
28. [Thread] "Why the Nash equilibrium of NumWit is 0 — and why knowing this makes you lose:"
29. [Thread] "I analyzed 1,000 NumWit games. Here's what the data says about human behavior:"
30. [Thread] "How I built a real-time multiplayer game for $0 in hosting costs:"
31. [Thread] "The behavioral economics behind NumWit — Keynes, Schelling points, and recursive prediction:"
32. [Thread] "6 months of indie game dev: what I shipped, what broke, what surprised me:"

**Engagement / polls:**
33. "If you've never played NumWit — what number would you pick in round 1? (Be honest)" [Poll: Under 30 / 30-50 / 50-70 / Over 70]
34. "Which player archetype are you in NumWit?" [Poll: Anchor (always ~50) / Contrarian (always low) / Calculator / Chaos Agent]
35. "Should I add a daily challenge mode to NumWit (same scenario for everyone, one result per day)?" [Poll: Yes / No / What's NumWit]

**Milestones:**
36. "100 players. Thank you." [screenshot of live player count]
37. "1,000 games played. Still can't believe people actually play this."
38. "Someone from [country] played NumWit today. We now have players in X countries."
39. "First negative review: 'this game is psychologically manipulative.' First positive review: 'this game is psychologically manipulative.' Thank you both."

**Reposts / community:**
40-50: RT results cards from players (with permission), RT posts where someone describes winning/losing, quote-tweet behavioral econ and game theory content with "this is literally NumWit."

---

### 20 Reddit Post Ideas

1. r/WebGames: "Browser game I built based on the Keynesian Beauty Contest — no download, play instantly [link]"
2. r/IndieGaming: "6 months of solo dev, here's my browser multiplayer game — feedback welcome"
3. r/gamedev: "The unexpected hard parts of building a real-time multiplayer game with Node.js + Socket.IO"
4. r/math: "I turned a real economics thought experiment into a browser game. Does the community converge to the Nash equilibrium?"
5. r/behavioral_econ: "Interactive Keynesian Beauty Contest — curious how this subreddit performs vs the general population"
6. r/SocialExperiment: "I ran 1,000 games of my Beauty Contest browser game. Here's what the data showed."
7. r/CasualGaming: "Made a free browser game for groups — like Among Us but the deception is mathematical"
8. r/discordservers: "Looking for active Discord servers to play a party game — I'll share our server too"
9. r/startups: "How I got my first 1,000 users for a browser game with zero marketing budget"
10. r/gamedesign: "The challenge of designing a game where the optimal strategy changes as players get smarter"
11. r/economics: "Browser game version of the Keynesian Beauty Contest — data from 10,000 games"
12. r/dataisbeautiful: "The distribution of player picks across 1,000 rounds of a Keynesian Beauty Contest game [OC]"
13. r/theydidthemath: "What is the true Nash equilibrium of NumWit, and is it achievable in practice?"
14. r/gaming: "The browser game that teaches you more about human psychology than most psychology courses"
15. r/Showerthoughts: "In NumWit, the smartest play is to predict that everyone else is smarter than they actually are"
16. r/legaladvice: [obviously joking] "My roommate keeps beating me at my own game. Is this grounds for termination?"
17. r/AskReddit: "What games have genuinely changed how you think? (Mine was a 5-minute browser game)"
18. r/pcgaming: "Free browser party game for 3-8 players — like Jackbox but the rounds take 30 seconds"
19. r/OnlineMathCircle: "Practical demonstration of iterative elimination of dominated strategies — you can play right now"
20. r/buildinpublic equivalent: "Building in public: NumWit monthly update — what's working, what isn't"

---

### Meme Marketing Ideas

**Template 1 — "Galaxy Brain" meme:**
- Level 1: "I'll pick 50, it's the middle"
- Level 2: "I'll pick 40, smarter than 50"
- Level 3: "I'll pick 32, accounting for level 2 thinkers"
- Level 5: "I'll pick 0, the Nash equilibrium"
- Level 6: "But what if everyone knows about Nash equilibrium..."
- Level 100: [picks 33] [wins]

**Template 2 — "They're the same picture" meme:**
Left panel: "Game theory textbook chapter on Keynesian Beauty Contests"
Right panel: NumWit gameplay screenshot

**Template 3 — "I'm in this photo and I don't like it" meme:**
Post of someone explaining why they picked 50. Caption: every NumWit first-timer.

**Template 4 — Distracted boyfriend:**
Boyfriend: Players
Girlfriend: "Just pick 50"
Other girl: NumWit asking them to predict what others will predict

**Template 5 — "It's the same energy" meme:**
Picking 50 in NumWit / Picking the safest answer on a multiple choice test you didn't study for

---

### Psychology-Based Content Ideas

**Content pillar: "The Levels of NumWit Thinking"**
Turn game theory levels into a content series. Each "level" is a post/video:
- Level 0: Pick a number that seems good (50)
- Level 1: Pick what you think the average minus 20% will be
- Level 2: Predict what Level 1 players will pick, then undercut that
- Level 3: Realize Level 2 thinking creates a new average, adjust accordingly
- Level N: Full recursive collapse. The equilibrium is 0. But...
- Level N+1: "Not if everyone else knows the equilibrium"

This series has infinite episodes and each one is legitimately interesting.

**Content pillar: "Real-world NumWit"**
Find real-world examples of Keynesian Beauty Contest dynamics:
- Stock markets ("buy what others think others will buy")
- Social media posting ("post what you think the algorithm thinks users want")
- Political polling ("vote for who you think will win, not who you prefer")
- Award shows ("nominate what you think Academy members think is important")

Each post ends with "You can practice this in real time at numwit.prajvex.com."

---

## Section 5: Community Building

### Getting the First 100 Users

This is purely manual. Don't automate anything.

**Week 1 — Your personal network:**
- Text or DM 30 people individually with a message like: "I built a game and I genuinely want you to try it and tell me if it's fun. Takes 5 minutes. No download." Do not mass-broadcast. Individually written messages get played. Broadcast messages get ignored.
- Host a session: "I'm hosting a game at 8pm tonight. Join with this link." Make it a specific time with a specific group. Show up. Play. Debrief.

**Week 2 — Content seeding:**
- Post one genuine "I built this" story on LinkedIn. Not promotional. Personal. "Here's the weird moment I realized I was losing my own game."
- Post in 1 relevant subreddit (r/WebGames first). Reply to every comment for 2 hours.

**Week 3 — Discord infiltration:**
- Join 5 relevant Discord servers. Become genuinely helpful in each for 1 week. Then share the game contextually — don't drop a link cold.

**Week 4 — Analytics checkpoint:**
- How many people played? What was the drop-off point? Did they leave after round 1? After losing? Did they come back?

**Goal:** 100 players who have played at least 3 rounds. Quality over quantity.

### Getting the First 1,000 Users

By this point you have data. You know the one thing that makes people stay (probably the exact match reveal, or the 1v1 endgame) and the one thing that makes them leave (probably confusion in round 1).

**Fix the leaving problem first.** If 70% of players leave after round 1, no amount of acquisition helps.

**Channels:**
- Product Hunt launch (target: 300 upvotes)
- One viral Reddit post (target: front page of r/WebGames)
- TikTok/Reels — post 5 videos per week for 4 weeks. One will pop.
- Hacker News Show HN
- 3-5 Discord servers with 1,000+ members where you've already built relationships

**The compounding event:** Coordinate a "NumWit Tournament" — structured bracket, Discord-based, streamed on Twitch if possible. 64 participants. Announce it 2 weeks before. This generates content (tournament brackets are inherently shareable), community (people root for participants), and press (niche gaming blogs cover tournaments).

### Getting the First 10,000 Users

This requires at least one non-linear event — something that reaches people who weren't already looking for you.

**Path A — Creator partnership (highest ROI):** One TikTok or YouTube creator with 50K-500K followers plays NumWit on camera. Even a 2-minute TikTok from a mid-tier creator can drive 50,000 new visitors. See Section 7 for outreach strategy.

**Path B — Press/newsletter mention:** Pitch to: The Pudding, Wait But Why, Farnam Street, Ben Thompson's Stratechery, Morning Brew Games. These are publications whose readers are exactly the NumWit audience (smart people who enjoy counterintuitive concepts). One mention = 5,000-20,000 visits.

**Path C — Academic adoption:** Reach out to economics and psychology professors. Offer NumWit as a free classroom tool for demonstrating the Beauty Contest concept. One professor with 200 students = 200 players. 20 professors = 4,000 players. These players are high-quality (intellectually curious) and share the game with their networks.

**Path D — Viral content moment:** The data post. After 5,000 games, publish "We analyzed 5,000 games of a Keynesian Beauty Contest browser game. Here's what humans actually do." Submit to r/dataisbeautiful, r/behavioral_econ, Hacker News. Data journalism is consistently viral among the target demographic.

### Daily Actions (What You Should Do Every Day)

**30 minutes per day — non-negotiable:**
- Post 1 tweet/X post (use the 50 ideas above as a bank)
- Reply to every mention, comment, or DM within 24 hours
- Play 1 game of NumWit (stay connected to the product)
- Check analytics: active users, session length, return rate

**3 hours per week:**
- Write 1 piece of longer content (Reddit post, blog post, Twitter thread)
- Do outreach to 3 potential collaborators (Discord servers, creators, professors)
- Review feedback widget submissions and respond to any critical bugs

**Weekly:**
- Host a scheduled public game and post the room code on Twitter and Discord
- Publish the data from that week's games ("Most common number picked this week: X")

---

## Section 6: SEO Strategy

### Keywords to Target

NumWit has a legitimate shot at ranking for several underserved terms.

**Transactional (people ready to play):**
- "multiplayer browser game no download"
- "online party game no download"
- "free browser game with friends"
- "multiplayer game for discord"
- "psychology game online multiplayer"
- "strategy game browser no signup"

**Informational (people learning about the concept):**
- "keynesian beauty contest game"
- "keynesian beauty contest explained"
- "keynesian beauty contest interactive"
- "beauty contest game theory"
- "80 percent rule game"
- "social prediction game"

**Comparative (people searching for alternatives):**
- "games like skribbl.io"
- "games like jackbox free"
- "browser party games 2025"
- "free games to play on discord"
- "among us alternatives browser"

### Blog Topics to Write

Even 5-10 blog posts dramatically improve SEO for a new domain.

1. "The Keynesian Beauty Contest: What It Is, Why It Matters, and How to Play It Right Now"
2. "Why Picking 50 Is Almost Always Wrong (The Math Behind NumWit)"
3. "Game Theory in Real Life: The Beauty Contest and the Stock Market"
4. "How to Win at NumWit: A Behavioral Economics Approach"
5. "The Best Free Browser Games to Play With Friends in 2025"
6. "Party Games for Discord: No Download, No Signup Required"
7. "What Is a Keynesian Beauty Contest? (And Why John Maynard Keynes Was Right)"
8. "The Psychology of Losing: Why Smart Players Lose at NumWit"
9. "Building a Multiplayer Browser Game: Technical Lessons From 10,000 Games"
10. "From 0 to 10,000 Players: How We Grew a Browser Game With No Marketing Budget"

### Landing Page Optimization

The current landing page has the right structure but needs these additions:

**Above the fold:**
- Add social proof counter: "Join 10,000+ players" (update as it grows)
- Add one testimonial quote near the CTA — not made-up, pulled from an actual Discord or Reddit comment

**Below the fold:**
- Add a "How it works" GIF (animated, not static screenshots)
- Add an FAQ section targeting SEO questions: "Do I need to download anything?" "How many players?" "Is it free?" "Can I play against bots?"
- Add a "Who plays NumWit?" section with player archetypes (economists, game theory lovers, Discord communities, college students)

**Meta tags:** ✅ *Done Oct 2026 (title, description, Open Graph/Twitter image, structured data, sitemap). FAQ + explainer page → Roadmap Sprint 4.*
- Title: "NumWit — The Free Multiplayer Game That Rewards Reading the Room"
- Description: "Play the Keynesian Beauty Contest in real time. Free browser game for 3-8 players. No download, no account. Play with friends or bots instantly."
- OG image: A screenshot of a round result reveal moment — the most dramatic visual the game has

---

## Section 7: Influencer Strategy

### Types of Creators Who Would Enjoy NumWit

**Tier A (highest ROI, hardest to get):**
- **Behavioral economics/psychology YouTubers** — Veritasium, Vsauce, Mark Rober style channels. The game IS their content. One video = 500K+ impressions.
- **Game theory channels** — SEFD Math, Primer, channels that explain prisoner's dilemma etc. NumWit is a perfect interactive demonstration.
- **Math/puzzle TikTokers** — channels like @talkingtomymirror or similar puzzle-explainer accounts

**Tier B (best ROI overall):**
- **Mid-tier gaming TikTokers (50K-500K)** — especially those who play party games with friends on camera. NumWit is perfect content: short rounds, visible results, funny moments.
- **Variety streamers (Twitch, 200-2,000 concurrent viewers)** — "Playing a game with chat" format. Chat picks numbers. Streamer predicts what chat will pick. Instant content loop.
- **"Play with friends" YouTube channels** — channels that regularly feature Jackbox, Among Us, Skribbl

**Tier C (volume play):**
- **Discord server owners** (1K-50K members) — reach out to 50, offer early access/special role in exchange for sharing with their community
- **College club accounts** — econ clubs, game theory clubs, math clubs, CS clubs — perfect institutional audiences

### Outreach Templates

**Template 1 — Creator DM (TikTok/Instagram):**
> "Hey [Name] — I built a browser game based on the Keynesian Beauty Contest (the same thing Keynes used to explain the stock market). It's multiplayer, free, no download. Round 1 every player thinks they understand it. Round 3 they realize they were completely wrong. I think it would make genuinely hilarious content with friends. Happy to set up a private game for you and whoever you want to invite. No strings, just thought you'd find it interesting."

**Template 2 — Streamer DM:**
> "Hey [Name] — have a game idea for a stream segment: you vs chat. You pick a number 0-100. Chat all pick numbers. The target is 80% of the average of all picks. You're trying to predict what chat will collectively pick, then undercut it by 20%. It takes 30 seconds per round and gets more chaotic with more people. Game is live at numwit.prajvex.com, free, no setup. Let me know if you want a custom room set up."

**Template 3 — Professor/educator email:**
> "Dear Professor [Name] — I'm a developer who built an interactive Keynesian Beauty Contest browser game. I've been aware that many instructors use the Beauty Contest as a classroom exercise, and I thought this might be a useful tool: students play in real time, the server records every submission, and you can replay rounds and discuss strategy afterward. It's completely free, runs in any browser, requires no setup. I'd be happy to set up a custom classroom game. [link]"

### Streamer Challenge Ideas

**"Chat vs Streamer"** — Streamer plays against their entire chat. Chat collectively picks numbers via !vote command (or just polls). Streamer tries to predict the chat's collective pick. This scales infinitely — a 10,000-viewer stream is a 10,000-player game of NumWit.

**"Expert vs Beginner"** — Streamer invites one "game theory expert" (anyone with economics background) vs one person who has never heard of the game. Track their picks across 10 rounds. Does expertise win?

**"Elimination Tournament"** — 8 streamer friends, 8-player game. Real stakes (the loser has to do something). Streamer drama + game drama + elimination = hours of content.

**"The $0 to $100 Round"** — Map picks to actual dollars. Whoever wins gets the pot. This is just NumWit but with real stakes. Even a $8 pot (8 players × $1) creates genuine tension.

---

## Section 8: Retention Strategy

### Daily Rewards

**"Daily Chip" system:** Log in and play one round = daily reward (bonus XP, cosmetic fragment, profile badge). This is the Duolingo streak mechanic — punishes absence rather than rewarding presence. Show a "current streak" counter on the profile.

**Weekly reward reset:** Every Monday, a "Weekly Challenge" unlocks (a specific game mode with bonus XP). Creates anticipation for Mondays specifically.

### Streaks

Two streak types:

**Game streak** — Consecutive days with at least one game played. Displayed on profile. Broken streak resets to 0 with a "comeback bonus" to ease re-entry.

**Win streak** — Consecutive games won (already partially implemented as `consecutiveGameWins`). Display as a flaming counter on the player card during games. Other players can see your streak and target you specifically. This is the "bounty target" mechanic from Call of Duty.

### Rankings

**Weekly leaderboard** — ✅ built (plus a real all-time tab, Oct 2026). Needs three additions:
- "Your rank" pinned at the bottom of the leaderboard even if you're not in the top 50 ("You're ranked #847 this week") — 🟡 *sticky rank bar exists for the top 50; beyond that → Roadmap Sprint 3*
- Friend comparison: "Among your friends, you're #2"
- Division system (Platinum/Gold/Silver/Bronze) to make "top 10%" feel achievable for most players

### Tournaments

**Format:** Open bracket, 64 players, Discord-announced, single elimination.
**Schedule:** Monthly. Announced 2 weeks in advance.
**Prize:** Digital. Profile badge ("Tournament Champion — January 2025"), cosmetic, Discord role.
**Streaming:** One person streams the finals. Other players watch as spectators.

Tournaments create: pre-event buzz, event content, post-event discussion. They also create new users — players recruit friends specifically to fill bracket slots.

### Seasonal Events

**Quarterly theme events (each lasts 2 weeks):**
- "The Finals" — Double XP, no-bot games only, elimination threshold reduced to 3
- "The Mind Games" — Special rule: picks are revealed in real time (see others pick as they pick)
- "Speed Round" — Timer reduced to 10 seconds
- "The Long Game" — Elimination threshold raised to 10 (very long games, high stakes)

**Holiday events:**
- New Year: "The Prediction Round" — only one round, everyone picks once, biggest prize of the year
- April Fools: Rules are secretly changed mid-game ("By the way, today the target is 120% of average")

---

## Section 9: Monetization Strategy

### Core Principle: Never Paywall Gameplay, Never Tax Virality

Any mechanic that lets paying players win more often will kill the community. Players who feel the game is unfair leave and tell others. Keep all game mechanics free forever.

The second, equally important principle this section adds: **revenue must never add friction to the loop the entire growth plan depends on** — instant join, no signup, no forced waits before a round starts. NumWit's highest-leverage growth channels (Hacker News, r/WebGames, r/gamedev, Discord) are also the most ad-hostile audiences on the internet. A monetization mistake in month 1 can poison the exact communities Section 3 is asking you to court. Everything below is designed around that constraint.

### The Funnel: Ads (everyone) → Cosmetics (some) → Pro (fewer) → Supporter (true fans)

Revenue now has two layers instead of one:

1. **Ad-supported free tier** — every player who never pays a cent still generates a small amount of passive revenue. This is the new piece (Google Ads / HTML5 game ad networks).
2. **Paid tiers** — cosmetics, Pro subscription, Supporter tier (unchanged from before), except **Pro's flagship benefit is now "remove all ads"** — the single most universally appealing upgrade hook in any ad-supported product (this is the same mechanic that converts free YouTube/Spotify users).

This turns two previously separate revenue ideas into one funnel: ads monetize the 97%+ who'll never pay, and they simultaneously make the paid tier more persuasive to the rest.

### Ad Layer — Where It Goes, What It Uses

**Why not just Google AdSense alone:** AdSense is built for content/blog sites, not interactive HTML5 games — it lacks rewarded-video and interstitial formats built for games, and fill rates drop hard outside the US/EU. The standard approach for browser games in 2026 is to run AdSense as a baseline and layer a gaming-native network on top (AdinPlay, Venatus, PlayWire are the common choices) so unfilled AdSense slots get backfilled by a network that actually understands game ad formats. Practically: sign up for AdSense first (it's free, no traffic minimum, just needs original content and a few weeks of history), add an AdinPlay/Venatus account once there's meaningful traffic, and let them compete for each impression.

**Exactly where ads are allowed to appear (and where they are never allowed):**

| Placement | Ad type | Allowed? |
|---|---|---|
| Landing page footer/sidebar | Static/display banner | ✅ Yes |
| Waiting room (pre-game lobby) | Display banner | ✅ Yes |
| Game-over screen | Interstitial (skippable after 5s) | ✅ Yes, max once per session |
| Game-over screen | Rewarded video — "watch 15s for +XP / cosmetic fragment" | ✅ Yes, fully optional, player-initiated |
| Active round (picking/submitting a number) | Any | ❌ Never |
| Round-result reveal overlay | Any | ❌ Never |
| Between rounds within the same game | Any | ❌ Never |

The rule of thumb: ads only run in moments where the player has already stopped actively playing (browsing, waiting, or finished). Never interrupt a round in progress, and never delay the "next round starts in 5s" countdown that Section 2 relies on for pacing. A rewarded-video option ("watch an ad, get a cosmetic fragment") is the one ad format that's genuinely opt-in and goodwill-neutral — it should be the first format shipped.

**Frequency caps (non-negotiable):** max 1 interstitial per session regardless of how many games are played in that session; rewarded video is unlimited but always player-initiated, never forced.

### Phased Rollout (protects early goodwill)

Ads turn on *after* the community exists, not before — this directly follows Section 10's WAP milestones:

- **Weeks 1-8 (0 → ~1,000 WAP):** No ads at all. This is the Product Hunt / Show HN / Reddit launch window — the most ad-sensitive audience you'll ever have, and the moment they form their first impression of NumWit. Ship cosmetics and Pro (already friction-free, already planned) but nothing ad-related yet.
- **Weeks 9-12 (~1,000-2,500 WAP):** Turn on AdSense in the lowest-friction placements only — landing page footer and waiting room banner. No interstitials yet. This is "free money" with effectively zero visible UX change for anyone already playing.
- **Month 4+ (post-2,500 WAP, after Section 10's "consolidation" checkpoint):** Add the game-over interstitial (capped at once/session) and the rewarded-video option. Add a gaming-specific network (AdinPlay/Venatus) to backfill AdSense and lift eCPM. Reframe Pro's pitch around "remove ads" at this point — that's when the upsell actually lands, because there's finally something concrete to remove.

If at any point ad-related feedback shows up in the feedback widget or Discord as a recurring complaint, that's a signal to pull back placements before it shows up in a Reddit/HN comment thread — reputational damage there is far more expensive than the ad revenue it costs to avoid it.

### Bonus Channel: Web Game Portals (Growth *and* Revenue at Once)

Separately from ads on your own domain, HTML5 multiplayer games can be listed on portals like **CrazyGames** and **Poki**, which combine a built-in audience (CrazyGames alone serves 300M+ plays/month across its catalog) with their own ad monetization and a revenue share back to the developer — typically requiring their lightweight SDK (handles their ad calls + analytics) in exchange for placement in their catalog and search. This is worth treating as its own acquisition channel in Section 3/5 once the game is stable: it's simultaneously a new user-acquisition surface (their traffic, not yours) and a new revenue stream (their ad infrastructure, not yours to build). Lower priority than the organic channels above, but close to free to set up once you already have a deployed build.

### Revenue Options (Ranked by User Goodwill Cost)

**Tier -1 — Passive, zero decision required from the player:**
- **Google Ads (AdSense + gaming network backfill)** — see placement table above. The only tier that monetizes players who never make a purchase decision at all.

**Tier 0 — Zero friction:**
- **Cosmetic avatars/emojis** — Additional avatar options beyond the default set. $0.99-$2.99 for a pack. These are visible to all players in game, so buyers get social visibility.
- **Profile themes** — Custom color schemes for your profile card. Pure cosmetic, no gameplay impact.
- **Achievement badges** — "Premium" badge designs for achievements you've already earned legitimately.

**Tier 1 — Low friction:**
- **NumWit Pro — $2.99/month:**
  - **Remove all ads** (flagship benefit — see Funnel section above)
  - Full round history export (CSV of all your games)
  - Detailed analytics (your average pick by round number, win rate by room size)
  - Custom room name
  - "Pro" profile badge
  - Early access to new game modes

**Tier 2 — Event-based:**
- **Tournament Entry Pass — $4.99:** Access to monthly prize-eligible tournaments. Free players can watch but not compete. Prize pool comes from entry fees (minus hosting costs).
- **Private Room Customization Pack — $1.99:** Custom room themes, custom elimination sounds, custom waiting room music. One-time purchase.

**Tier 3 — Community support:**
- **"Supporter" tier — $4.99/month:** No gameplay advantage whatsoever. Just a badge and the knowledge that you're keeping the servers on. Many indie game communities pay this willingly. Be honest: "NumWit costs $X/month to run. Supporters keep it free for everyone."

### What Not to Do
- No ads inside an active round or the result-reveal overlay (kills experience and pacing) — ads only run in landing/waiting/game-over moments, per the placement table above
- No ad that blocks or delays the "next round" countdown
- No XP boosters (pay-to-progress)
- No "extra lives" or "skip elimination" purchases
- No loot boxes
- No ads at all before ~1,000 WAP — protect first impressions during the launch window

### Realistic Revenue Projection

Two independent streams, both scaling with WAP — which is exactly why growth and revenue are the same chart now, not two separate ones.

**Ad revenue:** Browser/HTML5 games via AdSense + a gaming network typically land around $1-2 effective session RPM (revenue per 1,000 sessions) once optimized — well below mobile in-app rewarded-ad rates, because desktop/browser display inventory simply pays less. Assuming ~3 sessions/week per active player:

| WAP | Sessions/month | Ad revenue/month (~$1.5 RPM) |
|---|---|---|
| 1,000 | ~12,000 | ~$18 |
| 5,000 | ~60,000 | ~$90 |
| 10,000 | ~120,000 | ~$180-300 (higher end once gaming-network backfill + rewarded video are live) |
| 50,000 | ~600,000 | ~$1,200-1,800 |

**Subscription/cosmetic revenue (unchanged thesis):** at 10,000 players, assume 2-3% conversion to any paid tier at $3 average → $600-900/month.

**Blended at 10,000 WAP:** roughly $800-1,200/month combined — comfortably above the ~$10-25/month hosting cost, and the ad layer alone keeps the lights on even in a month with zero conversions. The honest takeaway: ads won't be the main driver until traffic is substantially larger than 10,000 WAP, but they cost nothing to implement, never ask a player to make a purchase decision, and they make "remove ads" a far stronger Pro pitch than the feature list alone ever was.

---

## Section 10: Prioritized 90-Day Execution Plan

### The North Star Metric
**Weekly Active Players (WAP)** — not total signups. A player counts only if they played at least one full game this week.

### Effort/Impact Matrix

| Action | Effort | Impact | Week | Status (Oct 2026) |
|---|---|---|---|---|
| Upgrade share results card | Low | Very High | 1 | ✅ Done (image card) |
| Add personalized titles | Medium | Very High | 1-2 | ✅ Done (Sprint 2) |
| Post Show HN | Very Low | High | 1 | ⬜ After Sprints 1–2 |
| Post r/WebGames | Very Low | High | 1 | ⬜ After Sprints 1–2 |
| 5 individual outreach DMs | Very Low | Medium | 1 | ⬜ Now |
| Post 3 TikToks | Low | Medium-High | 1-2 | ⬜ |
| Build daily challenge mode | Medium | High | 2-4 | ⬜ Sprint 5 |
| Product Hunt launch | Medium | Very High | 3-4 | ⬜ After retention data |
| Discord server setup | Low | Medium | 2 | ⬜ After retention data |
| Outreach to 3 professors | Very Low | High | 2-3 | ⬜ After Sprints 1–2 |
| Tournament #1 | Medium | High | 4-6 | ⬜ After retention data |
| Data analysis post | Low | High | 4-6 | 🟡 Data now logging (RoundLog) |
| Creator outreach (10 DMs) | Low | Very High | 3-6 | ⬜ After retention data |
| Blog post #1 (SEO) | Medium | Medium | 4 | ⬜ Sprint 4 |
| Rematch vote feature | Medium | High | 4-6 | ⬜ Sprint 3 |
| Spectator mode | High | High | 6-8 | ⬜ Later |
| Daily reward system | High | Medium | 7-10 | ⬜ Later |
| Set up Google AdSense account (no live ads yet) | Low | Low now / High later | 6-8 | ⬜ Later |
| Turn on AdSense — landing footer + waiting room only | Low | Medium | 9-10 | ⬜ Later (≥1,000 WAP) |
| Add gaming ad network (AdinPlay/Venatus) + interstitial + rewarded video | Medium | Medium-High | 12+ | ⬜ Later |
| Reframe Pro tier pitch around "remove all ads" | Low | High | 12 | ⬜ Later |

### Week-by-Week Execution

**WEEK 1 — Foundation**
- Day 1: Upgrade the share results card to produce a beautiful, screenshot-worthy image
- Day 2: Write and post the Show HN: "Show HN: NumWit – Keynesian Beauty Contest browser game"
- Day 3: Post on r/WebGames
- Day 4: Set up Twitter/X account. Write and post the Keynesian Beauty Contest explainer thread (pinned tweet)
- Day 5: Text 20 people individually to play. Host an 8pm session.
- Day 6-7: Reply to every comment on HN and Reddit. Track what questions people ask.

**WEEK 2 — Content Engine**
- Implement personalized post-game titles (The Contrarian, The Anchor, etc.)
- Post 3 TikToks from the "explain the game" category
- Join 5 Discord servers. Become helpful. Don't mention NumWit yet.
- Write first blog post: "Keynesian Beauty Contest — What It Is"
- Reach out to 3 economics professors by email

**WEEK 3 — Community**
- Create NumWit Discord server
- Post room codes daily on Twitter + Discord
- Respond to all feedback from week 1-2 — ship the 3 most requested QoL improvements
- Post on r/IndieGaming with the devlog angle
- Identify 5 TikTok creators (50K-200K) to DM. Send 3 outreach messages.

**WEEK 4 — Product Hunt Prep**
- Create Product Hunt "Coming Soon" page
- Ask 10 PH hunters to follow the upcoming launch
- Prepare all PH assets (GIFs, description, first comment)
- Post on r/SocialExperiment with data from first 1,000 games
- Ship rematch voting feature

**WEEKS 5-6 — Product Hunt Launch**
- Launch on PH (Tuesday)
- Day-of: post in 5 Discord servers, tweet, email personal network
- Reply to every PH comment within 1 hour
- Run first NumWit tournament (announce day after PH launch while traffic is high)

**WEEKS 7-8 — Amplify**
- Follow up with creator outreach (send game replays from interesting moments)
- Post Hacker News data post: "What I learned from 5,000 games of a Keynesian Beauty Contest"
- Submit to r/dataisbeautiful with round-data visualization
- Begin daily challenge mode development

**WEEKS 9-10 — Retention Infrastructure**
- Ship daily challenge mode
- Add "Your rank" to leaderboard (even when not in top 50)
- Ship cosmetic avatar packs (first monetization test)
- Turn on Google AdSense in the lowest-friction placements only (landing footer, waiting room banner) — first time any ad goes live, see Section 9's phased rollout
- Document what's working, cut what isn't

**WEEKS 11-12 — Consolidation and Next Phase**
- Analyze: WAP trend, retention curve, most-played room types, most-abandoned points
- Run tournament #2
- Identify the one growth channel with the best ROI and double down
- Add a gaming-specific ad network (AdinPlay/Venatus) to backfill AdSense; ship the game-over interstitial (capped 1/session) and the opt-in rewarded-video reward
- Reframe the Pro tier's pitch around "remove all ads" now that there's something concrete to remove
- Write Month 3 retrospective as a public blog post (this becomes its own growth content)

---

## Summary: The Three Things That Matter Most

After analyzing the game, the docs, and comparable games, three things will determine whether NumWit reaches 10,000 players:

**1. The share results card.** Wordle's growth was essentially a single tweet format. NumWit needs its equivalent — a compact, shareable, visually distinctive card that captures the most humiliating or triumphant moment from a game. Every session that ends without being shared is a missed acquisition. Build this first.

**2. The "aha moment" pipeline.** The UX docs are right: "the mechanic is invisible until round 3." The gap between new player confusion and genuine engagement is the biggest growth leak. Solo mode (already built) is the cure — but players need to be nudged toward it before they quit. Make solo mode the explicit first experience for new visitors, not just a mode option.

**3. The data post.** The most reliable way to reach 10,000 players is a single piece of content that goes viral in the right community. NumWit has something Wordle and Among Us couldn't offer: real behavioral data. "We analyzed 10,000 games of a Keynesian Beauty Contest browser game — here's what humans actually do" submitted to r/dataisbeautiful, Hacker News, and r/behavioral_econ is the most likely path to a non-linear growth event. This requires 10,000 games first. So play the long game for 60 days, collect data, then publish it in month 3.

---

*Generated June 2026 · Based on full codebase and design document analysis · numwit.prajvex.com*
