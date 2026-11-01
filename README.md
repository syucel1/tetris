# Prism

A local single-player falling-block game built with React, TypeScript, Vite and HTML5 Canvas.

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
