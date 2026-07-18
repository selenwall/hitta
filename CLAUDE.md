# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev   # Start local dev server (runs netlify dev)
npm start     # Same as above
```

There is no build step, linter, or test suite configured. The app is served directly from the root directory via Netlify.

## Architecture Overview

**Hitta!** is a two-player, turn-based, real-time multiplayer object-finding game built with vanilla JavaScript ES modules, Netlify Functions as backend, and TensorFlow.js for in-browser object detection.

### Game Flow

1. Player A creates a game (gets a `gameId`) and shares the URL (`?gid=...`) with Player B
2. Player A selects an object to find using the live camera (detect screen)
3. Player B has 120 seconds to find that object on their camera (play screen)
4. Players swap roles each round; first to 5 points wins

**Test mode**: open the app with `?mode=test` to play solo — the invite/accept flow is skipped, the game starts immediately, and the same device acts as both challenger (pick a target) and finder (find it again). Useful for testing the full game flow without a second player.

### Frontend Structure (`src/`)

- **main.js** — Entry point, attaches routing listeners to navigation events
- **router.js** — Central router; reads game state from backend and navigates between screens based on `gameState`, `role`, and URL params
- **store.js** — Thin global reactive store holding `gameState` and `userRole`
- **constants.js** — `WIN_POINTS`, `TURN_SECONDS` (120), `MIN_SCORE` (0.6)
- **camera.js** — Wraps `getUserMedia`, manages live detection loop
- **detector.js** — Loads COCO-SSD (mobilenet_v2 base) via TensorFlow.js, runs object detection, returns labeled bounding boxes
- **firebase.js** — Backend abstraction: GET/POST/PATCH game state via `/api/game` Netlify Function (despite the name, this is **not Firebase**)
- **translations.js** — Translates English ML labels to Swedish (cached, with LibreTranslate fallback)
- **timer.js** — Manages 120-second turn countdown
- **ui.js** — Screen show/hide helpers, score bar updates, share sheet
- **urlState.js** — Reads/writes `gid` query param

Screens in `src/screens/` each export an `init(gameId)` function and own their DOM section.

### Backend (`netlify/functions/`)

Single serverless function (`game.js`) backed by **Netlify Blobs** for storage. Handles:
- `GET /api/game?id=...` — Read game state
- `POST /api/game` — Create game
- `PATCH /api/game` — Update game state

Real-time sync is achieved by polling every 1500ms from the client.

### Key Design Decisions

- All ML inference runs **client-side** (TensorFlow.js + COCO-SSD loaded from CDN in `index.html`; model weights are downloaded once and cached, inference never leaves the device)
- No build tooling; ES modules served directly from root
- State lives in Netlify Blobs (keyed by `gameId`); no auth or user accounts
- UI language is Swedish; object detection labels translated on the fly
