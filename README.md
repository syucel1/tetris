# Prism

A local single-player falling-block game built with React, TypeScript, Vite and HTML5 Canvas.

## Feature roadmap

See [roadmap.html](roadmap.html) for the styled, printable roadmap or [roadmap.md](roadmap.md) for the matching Markdown document. Both include local game recovery for browser restarts and crashes as the first planned feature. This is planned work, not an implemented recovery feature.

After editing the HTML roadmap, run `node scripts/sync-roadmap.mjs` to regenerate Markdown and validate internal HTML links. Both formats are included in the Docker image; rebuild the image to update its served copies.

## Current round metrics

The **This round** panel shows active play time, pieces placed, lines cleared and average pieces per minute. Timing starts when a round starts, stops during pauses, settings and score dialogs, and excludes the other player's turns. Hold and failed spawns do not count as placed pieces. Metrics reset for each new round and freeze at game over. The summary compares the final score against the player's personal best at the start of that round. These per-round metrics are not stored as history or sent anywhere; existing saved high scores are unchanged.

## Players and local multiplayer

Choose or create a named profile in the lobby. Each profile stores its own preferences, keyboard mapping and personal best in this browser. Existing Prism settings and high scores migrate into the first profile. Guests are temporary and are never written to the profile store. Clearing browser data removes saved profiles; profiles are not authenticated accounts or synced across devices.

Select a second player (another saved profile or Guest) to open two boards. Start a round to alternate turns after every placed piece. Only the active board advances or accepts game input. Both scores stay visible. When one player tops out, the other continues until their board is also finished. Pause and settings pause the shared session. Different difficulty preferences are allowed; this mode is for friendly score comparison.

Under each player's Settings → Controls, select an action and press a replacement key. Duplicate bindings within a profile are rejected; Escape cancels remapping. Escape also pauses during play. Returning to the lobby resets boards; saved preferences and best scores remain. Guest data is discarded when leaving the session.

## Logging

The browser console receives structured records through the lightweight `loglevel` library. Events are `application_started`, `game_created`, `game_started`, `game_paused`, `game_resumed`, and `game_over` at INFO. Game records include a unique game ID, player ID and mode; every record includes a page-session ID, timestamp and level. Multiplayer waiting turns are not pauses. Game-over records also include score and cleared lines. Movement, gravity ticks and render updates are not logged.

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

Use **Make it yours** to choose dark/light appearance, three piece palettes, starting difficulty 1–10, animations, grid, ghost piece, sound and volume. Preferences, profile name and personal best are saved in this browser using localStorage. These settings belong to one local profile; clearing browser data clears them. No backend, account or multiplayer is used. Line sounds are synthesized with Web Audio. Fonts fall back to system sans-serif without network access.

Scoring: 100/300/500/800 × level for clearing 1/2/3/4 lines, 1 per soft-drop cell and 2 per hard-drop cell. Speed increases every 10 lines to level 10. Pieces use a shuffled seven-bag randomizer.




