# NumWit — Execution Roadmap
*Derived from GROWTH_PLAN.md, cross-referenced against the current codebase · first written June 2026 · **last updated 16 Oct 2026***

This is the actionable, build-status-aware version of GROWTH_PLAN.md. That document is the
playbook (why each idea works); this one is the sequence (what to actually do, in what order,
and who does it) — and the single place where status is tracked.

**Legend:** ✅ Done · 🟡 Partly done · 🔜 Next up · ⬜ Not started ·
🔧 Engineering task · 📣 Manual task (marketing/outreach — no code, only you can do this)

**Live at:** https://numwit.prajvex.com — Fly.io (1 always-on Machine) + Upstash Redis + Neon
Postgres. Deploy: merge to `main`, then GitHub → Actions → **CI / Deploy** → Run workflow, then
approve the `production` deployment (see `docs/FLY_DEPLOYMENT.md`).

---

## Already Built (verify, don't rebuild)

**Core game (built before June 2026)**
- ✅ Public / private / solo rooms, with bot auto-fill for public rooms
- ✅ Solo mode vs. bots (Section 1's "no other game in this category has this") — made
  genuinely smart in Oct 2026, see below
- ✅ Win streak tracking — current streak (`consecutiveGameWins`) and best streak ever
  (`bestStreak`)
- ✅ Achievements (22) + XP/Level system
- ✅ Feedback widget (bug/feature pipeline)
- ✅ Voice chat + emote reactions
- ✅ Round history view
- ✅ Mobile-disconnect grace period / reconnect handling
- ✅ Admin dashboard (rooms, feedback, leaderboard moderation)
- ✅ Production hardening — helmet, CORS, static SPA serving, correct Prisma migrate path

**Shipped Oct 2026**
- ✅ **Full UX redesign** — mobile-first dark theme, animated landing-page demo round, waiting
  room seat grid, animated pick phase (lock-in tracker, last-target marker, ±1 steppers),
  staged round-result reveal (two-column on desktop), game-over podium + XP bar + session chart
- ✅ **Shareable stat card upgraded** — 4:5 card exported at 1080×1350 with level ring, win rate,
  streaks and the game's rule; shows `numwit.prajvex.com` (Section 2, Item #1 — image version)
- ✅ **In-game chat** — chat now continues from the waiting room into the game (mobile sheet with
  unread badge + message banners; desktop side panel)
- ✅ **Leaderboard** — This week / All time tabs with a real all-time ranking, podium, and a
  sticky "your rank" bar (🟡 only when you're inside the fetched top 50 — see Sprint 3)
- ✅ **Installable app (PWA)** — app icon artwork, manifest with install screenshots, service
  worker, "Install app" button
- ✅ **SEO + link previews** — title/description, Open Graph + Twitter cards (1200×630 image),
  VideoGame structured data, `robots.txt`, `sitemap.xml`, per-page titles/canonicals, room
  links `noindex` (Section 6 "Meta tags")
- ✅ **Custom domain + hosting** — `numwit.prajvex.com` on Fly.io; CI runs tests on every PR;
  one-click deploy
- ✅ **Measurement**
  - Umami funnel events: `play_click` → `profile_done` → `room_join` → `first_pick` →
    `game_finished` → `share_card_open` / `share` / `invite`, plus installs
  - Admin → **Growth**: weekly active players (WAP) vs last week, returning players, new
    players, games by room type, 14-day daily-active chart (real players only)
  - `RoundLog` table: every round's human picks, anonymous — the raw material for the
    Section 5 Path D data post
- ✅ **Smarter bots** — bots learn how each player picks (from earlier rounds only, never the
  current one), counter a player's favourite duel move (0 / 1 / 100), and never block each
  other with duplicate picks. "Play vs Computer" asks for a level: Casual / Sharp / Ruthless /
  Adaptive (default — tougher while you lead, gentler while you trail). New achievements:
  🧠 Sharp Wit and 😈 Ruthless Slayer
- ✅ **Returning players skip the profile form** — "Play now" goes straight to the room
  picker; name and avatar are edited from a top-right profile menu
- ✅ **Fix: rounds waiting for the timer** — two picks arriving together could overwrite each
  other (and the lost player got a no-show penalty); room updates are now one at a time
- ✅ **Repo ready to be public** — `main` protected (PR + Code Owner review + both test
  suites), deploys only by the owner and only after approval in the `production`
  environment, read-only workflow token, secret scanning + push protection, history checked
  for leaked keys; Node 22 in CI and the Docker image, Fly deploy action pinned

---

## The Plan — build order

Each sprint is one PR. Ship in order; check the success metric in Umami / Admin → Growth
before moving on. Sprints 1–2 fix the plan's two biggest problems ("the mechanic is invisible
until round 3" and "every session that ends without a share is a missed acquisition"), which
is why the public launch posts wait for them.

### Sprint 1 — A first game that clicks 🔜 *(next)*
🔧 GROWTH_PLAN Summary #2 + Section 2 #1 (text version)
1. **Quick start vs bots** — "Play now" puts a first-time visitor straight into a game against
   bots with an auto-generated name + avatar (editable later). Returning players already go
   straight to public / private / bots (done Oct 2026).
2. **Round-1 explainer** — after the first round, a short, specific explanation of why the
   target was low ("most people pick around 50 → target 0.8 × 41.6 = 33 — next round, think one
   step further").
3. **Wordle-style text share** — copy-paste emoji summary of the player's rounds + placement +
   link; works in WhatsApp / Discord / X with no image.

**Success metric:** % of `play_click` visitors reaching `first_pick` and `game_finished`;
`share` events per finished game.

### Sprint 2 — Identity + invites ⬜
🔧 Section 2 #2, #6
1. **Personalized titles** — "The Contrarian", "The Anchor", "The Mind Reader", "The Comeback
   Kid"… from the game's picks; on the game-over screen, the stat card and the text share.
2. **"Challenge friends"** on game over — one tap creates a private room and opens the share
   sheet with the invite link and the player's title.

**Success metric:** `invite` + `share` events per finished game; new players arriving via
invite links (`room_join` with type `invite`).

### Sprint 3 — Keep groups playing ⬜
🔧 Section 2 #4, Section 8
1. **Rematch vote** — after game over, 2+ players vote and the room restarts (today only the
   host can restart).
2. **"Your rank" for everyone** — show the player's rank even outside the top 50 ("#847 this
   week") — needs a small server endpoint.

**Success metric:** games per session; Admin → Growth "returning from last week".

### Sprint 4 — Search traffic ⬜
🔧 Section 6
1. **FAQ block** on the landing page (free? download? how many players? bots?).
2. **Indexable explainer page** — "The Keynesian Beauty Contest, explained (and playable)" as a
   real HTML page, added to `sitemap.xml`.
3. One real testimonial near the CTA (needs a genuine quote from a player).

**Success metric:** Google Search Console impressions/clicks.

### Sprint 5 — Daily Challenge ⬜
🔧 Section 2 #3 — the plan's main "come back tomorrow" mechanic: same daily scenario for
everyone, one comparable, shareable result.

**Success metric:** returning players week over week.

### Later (unchanged from the original Phases 2–3) ⬜
- Public game feed on the landing page (Section 2 #7)
- Spectator mode (Section 2 #5)
- Daily Chip / login streaks + Division ranks (Section 8)
- Seasonal events, tournament infrastructure (Section 8)
- Revenue infrastructure: Stripe/checkout/webhooks + `paidTier` on `User` (none exists yet) →
  cosmetic avatar packs → AdSense (landing footer + waiting room only) → Pro "remove all ads",
  gaming ad network, game-over interstitial (max 1/session), rewarded video (Section 9)

---

## Launch & Outreach — when to do what 📣

**Now (in parallel with Sprint 1):**
- ⬜ DM 20–30 people individually (not a broadcast) + host one scheduled game (e.g. 9:30pm IST).
  Rooms need 3+ humans online at the same time — concentrate people, don't spread them out.
- ⬜ WhatsApp, college and alumni groups (link previews now show the game image).
- ⬜ Google Search Console: verify `prajvex.com` (DNS TXT), submit
  `https://numwit.prajvex.com/sitemap.xml`.
- ⬜ Create the X/Twitter account; post the pinned "why picking 50 is wrong" thread.

**After Sprints 1 + 2 ship** (first impressions with these audiences only happen once):
- ⬜ r/WebGames (GROWTH_PLAN Reddit idea #1) — reply to every comment for 2 hours.
- ⬜ Show HN — Monday 9am ET (6:30pm IST), technical framing from Section 3.
- ⬜ Email 3 economics/psychology professors (Section 7, Template 3) — Indian colleges count.

**After metrics show players stay** (Phase 1 exit criteria below):
- ⬜ Product Hunt launch, NumWit Discord server, tournament #1, creator outreach.
- ⬜ First data post from `RoundLog` once ~1,000 games are recorded (Section 5 Path D).
- ⬜ Later: press/newsletters, CrazyGames/Poki listing, content calendar (Section 4).

**Phase 1 exit criteria:** you can answer from the data where players drop off (round 1
confusion? after a loss? never return?) — Umami funnel + Admin → Growth. Section 5 is explicit:
fix the leaving problem before spending more on acquisition.

---

## Where to see the numbers

| Question | Where |
|---|---|
| Where do visitors drop off? | Umami → Events → Funnel: `play_click` → `profile_done` → `room_join` → `first_pick` → `game_finished` |
| Do finished games get shared? | Umami → Events: `share`, `share_card_open`, `invite` |
| Weekly active players (north star), returning players | `/admin` → Growth |
| What do humans actually pick? | Neon SQL editor → `RoundLog` (example query in `docs/FLY_DEPLOYMENT.md` §13) |
| Search traffic | Google Search Console |

**Daily habit (~30 min):** post one thing, reply to everything, play one game, check the funnel.

---

## The One Rule That Cuts Across Everything

Every monetization step is sequenced *after* a growth milestone, never before. GROWTH_PLAN.md
Section 9 already showed the math — ad revenue at 1,000 WAP is ~$18/month, not worth the
goodwill risk with an ad-hostile launch audience. No ads before ~1,000 weekly active players.
Revenue is a multiplier on growth, not a parallel track to race against it.
