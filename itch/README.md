# NumWit on itch.io

The itch.io page plays the real game from `https://numwit.prajvex.com` inside a frame,
so there is nothing to rebuild when the game changes. The server allows only itch.io
to embed the game pages (`frame-ancestors` in `server/server.js`). `/admin` and `/api`
still cannot be framed.

## Build the upload

From the repo root, in PowerShell:

```powershell
Compress-Archive -Path itch\index.html -DestinationPath itch\numwit-itch.zip -Force
```

The zip is git-ignored. Rebuild it only if `itch/index.html` changes.

## Project settings (Dashboard → Create new project)

| Field | Value |
|---|---|
| Title / URL | NumWit / `numwit` |
| Short description | Pick 0–100. Closest to 80% of the average wins. Outthink the room. |
| Classification | Games |
| Kind of project | **HTML** |
| Uploads | `numwit-itch.zip`, with **"This file will be played in the browser"** ticked |
| Embed options | Viewport 1280 × 720, **Mobile friendly** (orientation: default), **Fullscreen button** on |
| Pricing | No payments |
| Genre | Strategy |
| Tags | multiplayer, browser, party-game, game-theory, numbers, mind-game, bots, online |
| Visibility | Public |

**Description:** start with the website link (`▶ Prefer a full window? Play at https://numwit.prajvex.com`), then use the same text as the Reddit posts.

**Images:** a 630 × 500 cover, plus 3–5 screenshots (landing page, picking a number, round result, game over).

## Good to know

- Visits from itch arrive as `/?ref=itch`, so Umami shows how many come from there.
- Inside itch's frame, the browser stores the game's data separately. Someone who plays on itch and on the website directly counts as two players.
