# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

Open `index.html` directly in a browser, or serve with:

```bash
npx serve .
```

No build step, no bundler, no dependencies.

## Architecture

Single-file game (`game.js`) with a classic game loop — all logic is in one file, no classes needed (grid-based, no physics).

**Board:** `board` — `ROWS × COLS` matrix of `{ mine, revealed, flagged, adjacent }`. `COLS` (16), `ROWS` (12), `CELL` (36px), `MINES` (28).

**Game state globals:** `cursor` (`{ row, col }`), `score`, `flags`, `revealedCount`, `firstReveal`, `state` (`'playing' | 'gameover'`), `win`.

**Loop:** `requestAnimationFrame` → `loop()` → `update()` then `draw()`. No `dt` — the board only changes on discrete key presses, not per-frame physics.

**First-click safety:** mines are placed lazily, on the first `reveal()` call (`firstReveal` flag), excluding the revealed cell and its 8 neighbors (`placeMines(safeRow, safeCol)`) — so the opening move is never a mine.

**Flood fill:** `revealFlood(r, c)` is an iterative stack-based flood fill; a revealed cell with `adjacent === 0` pushes its unrevealed, non-mine neighbors.

**Input:** `keys` object tracks held keys; `justPressed` tracks single-frame presses (consumed on read via `pressed(code)`), same pattern as the other reference games. `Space` and `KeyF` are edge-triggered (`pressed()` only) — one reveal/flag per physical press. Arrow keys move `cursor` (clamped to the grid) through `moveCursor(code, dr, dc, ts)`: the initial press moves immediately via `pressed()`, then holding the key auto-repeats — `REPEAT_DELAY` (300ms) before the first repeat, `REPEAT_RATE` (70ms) between the following ones, tracked per-key in `repeatAt` against the `ts` the loop receives from `requestAnimationFrame`.

**Scoring:** `score += SCORE_PER_CELL (10) × cells newly revealed` on every `reveal()` call — a flood fill that opens 12 cells scores 120 in one keystroke. Score is never drawn on the board itself; it only appears in `drawOverlay()` on game over (`PUNTAJE: …`), since there is no in-canvas HUD anymore.

**One life:** there is no lives counter and no heart icon anywhere — revealing an unflagged mine ends the run immediately (`state = 'gameover'`, `win = false`) and reveals the rest of the mines via `revealAllMines()`.

**Win:** `state = 'gameover'`, `win = true` the moment `revealedCount === COLS × ROWS − MINES`.

**Game over → next screen:** both outcomes route through the same `state === 'gameover'` branch, which paints a full-canvas overlay (`drawOverlay()`) instead of the board — the "next screen" is that overlay, mirroring `03-tetris` and `02-asteroids`. `Space` (keyboard or the on-screen button) on that screen calls `initGame()` to restart.

**Flags:** `toggleFlag(r, c)` only affects unrevealed cells and is capped at `MINES` flags total.

**No in-canvas HUD.** The canvas (`W×H` = `COLS×CELL` × `ROWS×CELL`) is the board and nothing else — no reserved header strip. Score, lives and the flag/mine counters used to be drawn on the canvas; they aren't anymore. The only counters shown during play — flags placed and total mines — live in the DOM panel described below, updated by `refreshSideHud()` (called from `initGame()` and `toggleFlag()`), not on every frame.

## Touch controls (`index.html`)

`index.html` lays out `.layout` as a flex row: the `<canvas>` on the left, an `<aside class="controls">` panel to its right — never drawn inside the canvas itself. Top to bottom inside that panel: the `MOVIMIENTO` d-pad, then the `F` / `SPACE` action buttons (each with a label above it), then the `hud-section` with the live flag/mine counters (`#hud-flags`, `#hud-mines`).

Every button carries `data-code="ArrowUp|ArrowDown|ArrowLeft|ArrowRight|KeyF|Space"` matching the `e.code` values the keyboard handler already uses. `game.js` wires them generically: `pointerdown` sets `keys[code] = true` and `justPressed[code] = true` (same as a real `keydown`), `pointerup`/`pointerleave`/`pointercancel` clear `keys[code]`. Because this reuses the exact `keys`/`justPressed`/`pressed()` plumbing, the d-pad buttons get key-repeat for free through `moveCursor()` — holding one down auto-advances the cursor exactly like holding the physical arrow key.

## Tunable constants (top of game.js)

`COLS`, `ROWS`, `CELL`, `MINES`, `SCORE_PER_CELL`. If you change `COLS`/`ROWS`/`CELL`, update the canvas `width`/`height` attributes in `index.html` to match (`COLS×CELL` and `ROWS×CELL` — there is no HUD strip to add).
