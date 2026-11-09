# Prism

A local single-player falling-block game built with React, TypeScript, Vite and HTML5 Canvas.

## Project structure

```text
src/
  main.tsx            Entry point: logging, React root, stylesheet order
  App.tsx             Lobby, navigation, solo/shared-screen session and recovery wiring
  components/         React UI (PlayerGame, BoardFrame, SettingsModal, Lobby, dialogs, panels)
  hooks/              Board canvas, play clock, keyboard controls, key-binding capture
  game/               Pure rules: board primitives (engine), game state machine, match rules, round metrics
  profiles/           Local profiles, settings normalisation and storage keys
  recovery/           Validated checkpoint storage and the useRecovery hook
  session/            Seating rules: screen capacity, board layout, turn order, key clashes
  logging/            Structured console logging and lifecycle events
  ui/                 Palettes, canvas drawing, sound synthesis, key labels
  styles/             Stylesheets (imported in order from main.tsx)
```

Game rules live in `game/gameState.ts` as a pure `applyAction(state, action, startLevel)` function with unit tests; components own timing, input and side effects. Tests sit next to their modules (`*.test.ts`). Run `npm run format` to apply Prettier, or `npm run format:check` to verify.

## Local game recovery

Named-profile games are checkpointed in this browser after piece placement and lifecycle changes, with throttled movement saves and a two-second active-time refresh. Reopen the same browser origin after a refresh, closure, crash or application/container restart to choose **Resume saved game** or **Discard saved game**. Restore always starts paused and does not charge time spent away.

Checkpoints include each board, current/queued pieces, hold state, scoring, difficulty and preferences, active-play metrics, profile IDs and the active multiplayer turn. The queued seven-bag pieces are retained; future new bags continue to be shuffled normally, except in a standard two-player match, where the shared piece-sequence state and the match rules are saved too, so both boards still receive identical pieces after a restore. Existing personal bests are never reduced by restoring an older checkpoint.

Guest games do not save recovery data unless **Save this game for recovery, including Guest boards** is explicitly checked. That consent applies only to this local play session; Guest snapshots do not become named profiles. Turning the option off removes the recovery checkpoint. Leaving a game deliberately, discarding it, or finishing all boards clears the recovery offer.

The versioned save is validated before loading. A damaged primary save falls back to the previous valid checkpoint. Incompatible snapshots, missing profiles and storage failures show a message while allowing a fresh game. A failed write keeps the last successful save; crash recovery may lose recent moves. Recovery is browser-local and origin-specific, not a cloud backup, and cannot survive cleared browser data or guarantee writes when browser storage is disabled/full. Different hostnames or ports do not share a save.

## Roadmap documents

See [roadmap.html](roadmap.html) for the styled, printable roadmap or [roadmap.md](roadmap.md) for the matching Markdown document. Local game recovery, adaptive shared-screen multiplayer and fair two-player matches are marked implemented; the remaining six features are planned.

After editing the HTML roadmap, run `node scripts/sync-roadmap.mjs` to regenerate Markdown and validate internal HTML links. Both formats are included in the Docker image; rebuild the image to update its served copies.

## Current round metrics

The **This round** panel shows active play time, pieces placed, lines cleared and average pieces per minute. Timing starts when a round starts, stops during pauses, settings and score dialogs, and excludes the other player's turns. Hold and failed spawns do not count as placed pieces. Metrics reset for each new round and freeze at game over. The summary compares the final score against the player's personal best at the start of that round. These per-round metrics are not stored as history or sent anywhere; existing saved high scores are unchanged.

## Players and local multiplayer

Choose or create a named profile in the lobby. Each profile stores its own preferences, keyboard mapping and personal best in this browser. Existing Prism settings and high scores migrate into the first profile. Guests are temporary and are never written to the profile store. Clearing browser data removes saved profiles; profiles are not authenticated accounts or synced across devices.

After choosing the first player, use **Add player** to seat up to four players on one screen, each a saved profile or a Guest; a profile can only take one seat. The lobby shows how many boards this window can fit: every board must stay at least 120 px wide (12 px cells), so **Add player** is disabled when there is no room, and three or four boards switch to two rows on tall, portrait displays. With two or more players, choose how to play:

- **Alternating turns**: turns rotate after every placed piece, and only the active board advances or accepts game input.
- **Simultaneous**: every board plays at once. Each player needs their own keys; the lobby lists shared keys and blocks the start until they are resolved. **Give each player separate keys** assigns free key sets (arrows, WASD + Q/E, IJKL + U/O, number keys) to players who clash and saves them to their profiles. A shared pause key is fine; one press pauses everyone once. Many keyboards cannot register several held keys at once, so four players on one keyboard may notice dropped presses.

With three or four players, scores, status and settings stay separate per board and different difficulty preferences are allowed; when one player tops out, the others continue until every board is finished. Pause and settings pause the shared session.

## Two-player matches

With exactly two players the lobby offers a **Standard match** (the default) or a **Casual game**. **Versus** in the menu starts a standard match with alternating turns; choose Simultaneous in the lobby for a real-time match.

- **Shared rules:** one start level for both players (chosen in the lobby, default 1; it overrides each player's difficulty preference for the match only), the usual scoring and speed-up every 10 lines, hold allowed for both, and the **same pieces in the same order** on both boards (each round uses a fresh shared seed).
- **Personal preferences** (theme, palette, ghost, grid, sound and keys) stay with each player and are never changed by a match.
- **Before the start** both players see the rules above the boards and press **I'm ready** on their own board. When both are ready a 3-second countdown starts; un-readying cancels it.
- **Win condition (score race):** both boards play until they top out. The higher final score wins; equal scores are a tie. A player who tops out first waits while the other plays on.
- **Result:** both players see the same result above the boards (winner and margin, or tie) with each player's score, lines, pieces, play time and pieces per minute, plus their own round summary on their board. **Rematch** (on a board or in the toolbar) returns to the ready check and marks that player ready. Asking for a rematch mid-round pauses the round; **Back to the current round** cancels.
- A **Casual game** behaves like the three- and four-player sessions: personal difficulty, independent piece sequences, no winner.

A finished match is logged as `match_finished` (outcome, winner ID, scores, start level and play style).

If the window shrinks so that the boards would fall below the readable size, play pauses and a dialog explains how many boards fit. Enlarge the window or zoom out and the dialog closes by itself (resume with **Resume**), or remove a player from the round (their board ends; preferences and best score are kept), or go back to the lobby. Boards are never removed or shrunk below the minimum without asking.

Under each player's Settings → Controls, select an action and press a replacement key. Duplicate bindings within a profile are rejected; Escape cancels remapping. Escape also pauses during play. Returning to the lobby resets boards; saved preferences and best scores remain. Guest data is discarded when leaving the session.

## Logging

The browser console receives structured records through the lightweight `loglevel` library. Events are `application_started`, `game_created`, `game_started`, `game_paused`, `game_resumed`, `game_over` and `match_finished` at INFO. Game records include a unique game ID, player ID and mode; every record includes a page-session ID, timestamp and level. Multiplayer waiting turns are not pauses. Game-over records also include score and cleared lines. Movement, gravity ticks and render updates are not logged.

Unhandled browser errors, unhandled promise rejections and React root errors are logged at ERROR with error details and available player IDs. Profile storage failure is logged at WARN. Logs stay in the browser console; no history store or remote transmission is added.

Set `VITE_LOG_LEVEL=DEBUG`, `INFO`, `WARN` or `ERROR` in `.env.local` (see `.env.example`), then restart Vite or rebuild production assets. INFO is the default; invalid values fall back to INFO. For a browser-specific override, run `localStorage.setItem('tetris-log-level', 'DEBUG')` in the developer console and reload. Remove that key to restore the build setting. DEBUG includes INFO/WARN/ERROR; ERROR shows only errors. Each full page load starts a new session ID; named player IDs remain stable across reloads and Guest IDs are temporary.

## Docker

Install and start Docker Desktop with Linux containers (or Docker Engine with the Compose plugin). No host Java, Node or Gradle installation is needed for this workflow.

```sh
docker compose up --build -d
docker compose ps
```

Open [Tetris](http://localhost:8080) or the [roadmap](http://localhost:8080/roadmap.html). Stop with `docker compose down`. Rebuild after source changes with `docker compose up --build -d`. View server logs with `docker compose logs -f tetris`; browser game lifecycle logs remain in the browser console.

The multi-stage image uses Node 22 and Java 21 to run the pinned Gradle Wrapper, including all tests and the production build. Only compiled assets, the roadmap and Nginx are included in the final image. Nginx runs as a non-root user on port 8080 with a health check, a read-only filesystem and temporary files in `/tmp`. Compose exposes it only on this machine's loopback interface. Build caches speed up dependency downloads; `.dockerignore` excludes host dependencies, Git data and local environment files.

Optional PowerShell configuration before building:

```powershell
$env:TETRIS_PORT = '8081'      # Host port; container still uses 8080
$env:VITE_LOG_LEVEL = 'WARN'   # Compiled into browser assets at build time
docker compose up --build -d
```

Browser profiles remain in localStorage, not a container volume. A different hostname or port is a different browser origin: profiles at `127.0.0.1:5173` will not automatically appear at `localhost:8080`. Container recreation preserves profiles at the same origin, unless browser data is cleared. This is static local hosting; it does not add accounts, cloud storage or network multiplayer. This configuration is for local HTTP use; a public deployment would also need TLS and suitable hosting configuration.

## Local development with Gradle

Use the committed Gradle Wrapper. Prerequisites: Java 17+ (Java 21 recommended), Node.js 22.6+ and npm available on PATH. Gradle 9.6.0 is pinned by the wrapper; a separate Gradle installation is unnecessary. The first run on a new machine downloads Gradle and the locked npm dependencies.

Windows PowerShell:

```powershell
# Only needed when Java is not already configured:
$env:JAVA_HOME = 'C:\dev\tools\jdk-21.0.12.1'
.\gradlew.bat build   # Install dependencies, run all tests, type-check and build dist/
.\gradlew.bat dev     # Start the local browser preview; Ctrl+C stops it
```

macOS / Linux: use `./gradlew build` and `./gradlew dev` (if needed, `chmod +x gradlew` once). `gradlew test` runs the tests, `gradlew clean` removes generated output, and `gradlew clean build` performs a fresh production build. Windows uses `.\gradlew.bat` for the same tasks.

Gradle coordinates the frontend build; the existing npm scripts and Vite compiler remain underneath. `npmInstall` uses `npm ci` when package inputs change; `frontendBuild` supports incremental builds. Tests run on every `build` or `test`. `clean` preserves installed dependencies and local browser profiles. Stop a running preview before reinstalling dependencies on Windows to avoid executable file locks.

## Play

Arrow keys move, rotate and soft-drop. Space hard-drops, C holds, and P or Escape pauses. Touch buttons are available on smaller screens. Losing browser focus automatically pauses play.

Use **Make it yours** to choose dark/light appearance, three piece palettes, starting difficulty 1–10, animations, grid, ghost piece, sound and volume. Preferences, profile name and personal best are saved in this browser using localStorage. These settings belong to one local profile; clearing browser data clears them. No backend, account or network multiplayer is used. Line sounds are synthesized with Web Audio. Fonts fall back to system sans-serif without network access.

Scoring: 100/300/500/800 × level for clearing 1/2/3/4 lines, 1 per soft-drop cell and 2 per hard-drop cell. Speed increases every 10 lines to level 10. Pieces use a shuffled seven-bag randomizer.







