# Prism

A local single-player falling-block game built with React, TypeScript, Vite and HTML5 Canvas.

## Players and local multiplayer

Choose or create a named profile in the lobby. Each profile stores its own preferences, keyboard mapping and personal best in this browser. Existing Prism settings and high scores migrate into the first profile. Guests are temporary and are never written to the profile store. Clearing browser data removes saved profiles; profiles are not authenticated accounts or synced across devices.

Select a second player (another saved profile or Guest) to open two boards. Start a round to alternate turns after every placed piece. Only the active board advances or accepts game input. Both scores stay visible. When one player tops out, the other continues until their board is also finished. Pause and settings pause the shared session. Different difficulty preferences are allowed; this mode is for friendly score comparison.

Under each player's Settings → Controls, select an action and press a replacement key. Duplicate bindings within a profile are rejected; Escape cancels remapping. Escape also pauses during play. Returning to the lobby resets boards; saved preferences and best scores remain. Guest data is discarded when leaving the session.

## Logging

The browser console receives structured records through the lightweight `loglevel` library. Events are `application_started`, `game_created`, `game_started`, `game_paused`, `game_resumed`, and `game_over` at INFO. Game records include a unique game ID, player ID and mode; every record includes a page-session ID, timestamp and level. Multiplayer waiting turns are not pauses. Game-over records also include score and cleared lines. Movement, gravity ticks and render updates are not logged.

Unhandled browser errors, unhandled promise rejections and React root errors are logged at ERROR with error details and available player IDs. Profile storage failure is logged at WARN. Logs stay in the browser console; no history store or remote transmission is added.

Set `VITE_LOG_LEVEL=DEBUG`, `INFO`, `WARN` or `ERROR` in `.env.local` (see `.env.example`), then restart Vite or rebuild production assets. INFO is the default; invalid values fall back to INFO. For a browser-specific override, run `localStorage.setItem('tetris-log-level', 'DEBUG')` in the developer console and reload. Remove that key to restore the build setting. DEBUG includes INFO/WARN/ERROR; ERROR shows only errors. Each full page load starts a new session ID; named player IDs remain stable across reloads and Guest IDs are temporary.

## Run

```sh
npm install
npm run dev
```

Open the printed local URL. `npm run build` creates a production build in `dist`. `npm test` runs engine checks (Node 22.6+).

## Play

Arrow keys move, rotate and soft-drop. Space hard-drops, C holds, and P or Escape pauses. Touch buttons are available on smaller screens. Losing browser focus automatically pauses play.

Use **Make it yours** to choose dark/light appearance, three piece palettes, starting difficulty 1–10, animations, grid, ghost piece, sound and volume. Preferences, profile name and personal best are saved in this browser using localStorage. These settings belong to one local profile; clearing browser data clears them. No backend, account or multiplayer is used. Line sounds are synthesized with Web Audio. Fonts fall back to system sans-serif without network access.

Scoring: 100/300/500/800 × level for clearing 1/2/3/4 lines, 1 per soft-drop cell and 2 per hard-drop cell. Speed increases every 10 lines to level 10. Pieces use a shuffled seven-bag randomizer.

