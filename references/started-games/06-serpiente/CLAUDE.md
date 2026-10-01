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

**Board:** there is no board matrix. The grid is implicit in `COLS` (24) × `ROWS` (18) × `CELL` (24px), and the only occupants are the snake and one fruit. `occupied(x, y)` scans `snake` directly — at a reachable length of a few dozen segments that is cheaper than maintaining a second structure, and it is the one place a React port might want an index instead.

**Game state globals:** `snake` (array of `{ x, y }`, `snake[0]` is the head), `dir` (the direction applied on the last step), `dirQueue` (pending turns), `fruit` (`{ x, y }`), `score`, `fruits`, `level`, `acc`/`lastTs` (time accumulator), `state` (`'playing' | 'gameover'`).

**Loop:** `requestAnimationFrame` → `loop(ts)` → `update(ts)` then `draw()`. Unlike `05-buscaminas`, `update()` **does** use time: the snake advances on its own. `acc` accumulates `dt` and a `while (acc >= tickMs())` drains it into discrete `step()` calls, so the step rate is independent of the frame rate. `dt` is clamped to 200 ms, otherwise a backgrounded tab returns and fires a burst of steps the player never saw.

**Step rate:** `tickMs()` = `max(TICK_MIN, TICK_BASE − (level − 1) × TICK_STEP)` — 150 ms at level 1, shedding 12 ms per level, floored at 60 ms. The floor is the whole difficulty curve; there is no other speed knob.

**Input — a latched direction, not held state.** `keys` / `justPressed` / `pressed(code)` is the same plumbing as the other reference games, but the arrows are read **only** through `pressed()`, edge-triggered, with **no auto-repeat** (no `REPEAT_DELAY`/`REPEAT_RATE` — that is `05-buscaminas`' cursor model, and it does not apply here). Holding an arrow does nothing beyond the first press. `Space` is edge-triggered too and only means anything on the game-over screen.

**Direction queue — load-bearing, not an optimization.** `enqueueDir(code)` pushes onto `dirQueue` (capped at `QUEUE_MAX` = 2) and `step()` consumes exactly one entry per step. A single slot would let two turns inside one step overwrite each other: the second turn would be validated against `dir`, which has not advanced yet, so right-then-up at the same instant can resolve into a reversal and the snake eats its own neck. The classic bug, invisible until a fast player finds it. Validation is against `dirQueue`'s **last** entry (falling back to `dir` when the queue is empty), never against `dir` alone: an exact reversal is dropped, and so is a repeat of the same direction.

**Collision and the vacating tail:** `step()` computes `next`, fails on out-of-bounds (that is the wall — there is no wrap), then tests `next` against the body. When the snake is **not** about to eat, the last segment is excluded from that test, because it vacates its cell in this same step — following your own tail at distance zero is legal, and testing against the full body would kill the player for it.

**Growth:** `snake.unshift(next)` always; `snake.pop()` only when the step did not eat. That is the entire growth rule.

**Fruit:** `placeFruit()` collects every unoccupied cell and picks one with `Math.random()`. Choosing from the free list rather than rejection-sampling means it cannot loop as the snake fills the grid. `432` cells against a realistically reachable length means `free` is never empty in practice.

**Scoring:** `score += SCORE_PER_FRUIT (10) × level` per fruit, so the same fruit is worth 10 at level 1 and 40 at level 4. `level = 1 + floor(fruits / FRUITS_PER_LEVEL (5))`. Score is never drawn on the board itself; it only appears in `drawOverlay()` on game over (`PUNTAJE: …`), since there is no in-canvas HUD.

**One life:** there is no lives counter and no heart icon anywhere — the wall or the snake's own body ends the run immediately (`state = 'gameover'`).

**No win state:** the level is unbounded and the score is monotone. There is no cleared-board branch and no `win` flag — the only outcome is the end of the run, which is what keeps the leaderboard open-ended.

**Game over → next screen:** the `state === 'gameover'` branch paints a full-canvas overlay (`drawOverlay()`) **on top of** the final board rather than replacing it, so the player sees the collision that killed them. The "next screen" is that overlay, mirroring `03-tetris`, `02-asteroids` and `05-buscaminas`. `Space` (keyboard or the on-screen button) calls `initGame()` to restart.

**No in-canvas HUD.** The canvas (`W×H` = `COLS×CELL` × `ROWS×CELL` = 576×432, exactly 4/3) is the board and nothing else — no reserved header strip. Score, level and length are never drawn on it. The two live counters shown during play — level and length — live in the DOM panel described below, updated by `refreshSideHud()` (called from `initGame()` and from the fruit branch of `step()`), not on every frame: both only change when a fruit is eaten.

## Touch controls (`index.html`)

`index.html` lays out `.layout` as a flex row: the `<canvas>` on the left, an `<aside class="controls">` panel to its right — never drawn inside the canvas itself. Top to bottom inside that panel: the `GIRO` d-pad, then the `SPACE` restart button, then the `hud-section` with the live level/length counters (`#hud-level`, `#hud-length`).

Every button carries `data-code="ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Space"` matching the `e.code` values the keyboard handler already uses. `game.js` wires them generically: `pointerdown` sets `keys[code] = true` and `justPressed[code] = true` (same as a real `keydown`), `pointerup`/`pointerleave`/`pointercancel` clear `keys[code]`. Because the arrows are edge-triggered only, the d-pad deliberately gets **no** key-repeat — one tap is one queued turn, which is exactly the intent.

## Tunable constants (top of game.js)

`COLS`, `ROWS`, `CELL`, `START_LENGTH`, `SCORE_PER_FRUIT`, `FRUITS_PER_LEVEL`, `TICK_BASE`, `TICK_STEP`, `TICK_MIN`, `QUEUE_MAX`. If you change `COLS`/`ROWS`/`CELL`, update the canvas `width`/`height` attributes in `index.html` to match (`COLS×CELL` and `ROWS×CELL` — there is no HUD strip to add), and keep the result at 4/3.

**Grid resolution is the one number a React port must revisit.** 24×18 at `CELL` 24 is comfortable on a desktop canvas, but inside the app's mobile tube the 4/3 box leaves roughly 292 px of height at a 390 px viewport, which puts 24×18 near 14 px cells. A coarser ~20×15 lands near 17 px. Decide that in the spec, with the real measurement, rather than inheriting 24×18 from this prototype.
