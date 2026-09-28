---
name: add-game
description: Guided flow to design a new playable game for Arcade Vault's catalog (a fourth TETRIX/ASTEROIDES/ARKANOID-style engine). Extracts the shared conventions the three existing engines already establish, asks only about what's actually undecided, and writes a spec — never code. Use before adding a new game.
disable-model-invocation: true
argument-hint: "game idea, working title, or a references/started-games/ path to port"
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Bash(ls:*), Bash(cat:*), Bash(date:*), Bash(grep:*)
---

# /add-game — New catalog game designer

## Session context

Today's date (use this for the spec header, never guess it):
!`date +%F`

Specs that already exist:
!`ls specs/ 2>/dev/null || echo "The specs/ folder does not exist yet"`

Reference implementations available to port:
!`ls references/started-games/ 2>/dev/null || echo "references/started-games/ does not exist"`

Slugs already taken in the catalog (from the seed migration — the live table may have moved on, verify in Phase 1):
!`grep -A6 "insert into public.games" supabase/migrations/*.sql 2>/dev/null | grep -oE "'[a-z-]+', '[A-ZÁÉÍÓÚÑ]+'" || echo "not found"`

---

## What this skill produces

A new spec at `specs/NN-slug.md`, following this repo's spec-driven workflow. **This skill never writes code** — that is `/spec-impl`'s job once the spec is `Aprobado`.

## Why this isn't just `/spec`

Three games already exist (`TETRIX`, `ASTEROIDES`, `ARKANOID`) and between them they've already settled almost every structural question a fourth game would raise: a common HUD, a common component contract, a common scoring/persistence flow, a common fullscreen wrapper, a fixed database schema. Plain `/spec` doesn't know any of that — it would re-ask questions the codebase has already answered three times. This skill front-loads that shared contract in Phase 1 so Phase 2 only asks about what's genuinely specific to the new game: its rules, its board, its controls.

---

## Phase 1 — Load the shared contract (always, before asking anything)

Read, in this order:

1. **`CLAUDE.md`** — the paragraph describing the three engines and the `ENGINES` registry rule ("adding a fourth engine means adding a row there, not another branch").
2. **`specs/13-tetrix-motor-jugable.md`**, **`specs/14-asteroides-motor-jugable.md`**, **`specs/15-arkanoid-motor-jugable.md`**, in full. These three are the concrete precedent for what a game spec in this repo looks like and what rules every engine follows — lean on their §3 (Diseño) structure and their §6 (Decisiones) density when you write Phase 3.
3. **`specs/18-guardado-real-de-puntuaciones.md`** and **`specs/19-pantalla-completa-movil.md`** — for context only. A new game inherits real score-saving, the plays counter, and the fullscreen button automatically through the `ENGINES` registry and a `public.games` row. Don't write a section about any of these three in the new spec; just confirm in Phase 3 that nothing about the new game breaks their assumptions (e.g. it does expose `score`/`level` through `onRun` like every other engine).
4. **The live code, not the old specs' prose about it.** Specs 13–15 predate the Supabase catalog migration (SPEC 16–17–18) and some of their text describes a `lib/games.ts` array that no longer exists. Read instead:
   - `components/game-player.tsx` — the current `ENGINES` registry and the `EngineProps` type.
   - `lib/supabase/games.ts` — the `Game` type and what `getGames()`/`getGameBySlug()` return.
   - `supabase/migrations/*catalogo*.sql` — the real `games`/`categorias` schema. This is where the hard limits live: `color` is a CHECK-constrained enum (`cyan`/`magenta`/`yellow`/`green`), `dificultad` is `1..5`, `jugadores` is `1` or `2`, `perifericos` is a subset of `{teclado, raton}`, and `categorias` only has four rows (`ARCADE`/`PUZZLE`/`SHOOTER`/`VERSUS`).
   - `app/page.tsx` and `components/home/home-games.tsx` — confirm whether the home page still renders every game or slices the list (it stopped slicing to 6 after the Supabase migration; re-verify, don't trust the old spec text).
   - `components/hall-of-fame.tsx` — confirms the default `/salon` tab is `games[0].id`, itself ordered by `created_at` in `getGames()`.
   - `tests/screens.spec.ts` — grep the current `.card`, `.cover-bg`, and `.hall-tabs .chip` count assertions and their line numbers. Don't reuse the line numbers from specs 13–15; they've shifted.
5. **`references/started-games/`** (listed in the session context above). If a folder matching the requested game already exists, that's the porting source, exactly like `03-tetris/`, `02-asteroids/`, `04-arkanoid/` were. If it doesn't exist, say so plainly in Phase 2 instead of assuming one — designing rules from nothing is a bigger spec than porting a working reference.
6. **Whether any decorative (motor-less) catalog entries still exist.** Check the current `public.games` rows (via `mcp__supabase__list_tables`/`execute_sql` if you have DB access, or by asking the user) against the three known engine slugs. If SPEC 17 already removed every non-playable entry, the new game can only be **additive** — there is no decorative row left to replace.

## Phase 2 — Ask questions, grounded in the three existing engines

Same discipline as `/spec`'s Phase 2: blocks of 3–5 questions, wait for an answer before continuing, use `AskUserQuestion` with a recommendation marked, flag anything that wants its own spec (e.g. "and it needs a leaderboard filter" is not this spec). Your replies must be in the same language as the initial prompt (Spanish, going by the three precedent specs).

**Skip a block outright — state the assumption instead of asking — when all three existing engines already agree AND nothing the user has said suggests they want to diverge.** Only ask when the three disagree (lives, level cap, aspect ratio all vary between them) or when the new game's genre makes the unanimous answer implausible (e.g. a two-player game makes "no sound" or "jugadores: 1" worth confirming rather than assuming).

### Block 1 — Identity and reference

1. Working title → `title` (Spanish, uppercase in the UI) and `id`/slug (lowercase, becomes the URL segment and the `ENGINES` key). Check it doesn't collide with a slug from the session context or the live table.
2. Reference implementation: does `references/started-games/0N-<name>/` already exist to port? If not — confirmed from Phase 1 — say explicitly that this spec is designing rules from scratch, not porting a working reference, and that's a materially bigger scope than the three precedents.
3. Category: `ARCADE` / `PUZZLE` / `SHOOTER` / `VERSUS` — the only four rows in `categorias`. A fifth category needs its own migration and is out of scope unless the user explicitly asks for it.

### Block 2 — Catalog slot and card metadata

4. Additive at the end of the catalog (like `ARKANOID`), or does it replace an existing entry? Only possible if Phase 1 found a decorative row still standing.
5. `short` (one sentence) and `long` (2–3 sentences) descriptions, `dificultad` (1–5), `jugadores` (1 or 2), `perifericos` (subset of `teclado`/`raton` — no mouse-only or gamepad-only game without a schema change first).
6. `color` token: one of `cyan`/`magenta`/`yellow`/`green`. A new color is its own decision (new CSS token + migration CHECK update) — flag it, don't assume it's in scope.
7. Real screenshot (`public/juegos/<slug>.png`, taken once the game is playable, like all three existing games) or a CSS-drawn `cover-*` fallback class only?

### Block 3 — Engine rules

8. Lives: `1` (Tetrix/Asteroides — one hit ends the run) or `3` (Arkanoid — more forgiving)? This is `games.vidas`, a DB column now, not a `lib/` constant.
9. Level cap: capped like Tetrix's `min(10, …)`, or uncapped (`niveles: null`) like Asteroides/Arkanoid? This is `games.niveles`.
10. Scoring: fixed point table multiplied by level (Tetrix, Arkanoid) or not (Asteroides, deliberately, so the 20/50/100 table stays literal)?
11. Anything in the game that needs to be **deterministic** specifically so a Playwright test can assert "score becomes > 0 after this action" without depending on RNG (like Arkanoid's non-random `serve()`)? Identify it now — retrofitting determinism after the engine is built is more expensive.
12. Any pickups/power-ups? If yes: how many kinds, effect, duration, drop rate, and confirm (or deliberately override) the existing rule that at most one exists on screen at a time.

### Block 4 — Board, aspect ratio, and controls

13. Does the board's natural shape fill `.crt-screen`'s `4/3` (Arkanoid — no screen modifier needed), or not (Tetrix's 1:2 needed a `3/4` mobile modifier; Asteroides is 4:3 but still needed to stack controls under the board on mobile)? This decides whether a new `.crt-screen.<modifier>` class is needed and whether its pixel math at 390px needs to be worked out (like SPEC 13 §3.4 and SPEC 14 §3.4 did).
14. Controls layout: a titled side column (Tetrix/Asteroides desktop pattern) or a pad below/overlaying the board (Arkanoid — note SPEC 15 §8 moved its pad _off_ the board after finding it covered the paddle)?
15. Input model: discrete moves repeated on a ~110ms interval while held (Tetrix's d-pad) vs. continuous/held state read every frame (Asteroides, Arkanoid)?
16. Keyboard bindings — confirm none of them scroll the page (arrows/Space need `preventDefault()`), and that `P` calls the same `onTogglePause` the HUD's `PAUSA` button calls, never separate local state.

### Block 5 — Color tokens and canvas rendering

17. New CSS tokens needed, following the `--piece-*` / `--rock-*` / `--brick-*` prefix pattern — how many, and can they reuse existing neon/mix values already in `:root` (`--cyan`, `--magenta`, `--yellow`, `--green`, plus the established mixes `--piece-z` amber, `--piece-j` violet, `--piece-l` electric blue, `--silver`) instead of inventing new hex?
18. Anything drawn inside the canvas beyond the board itself, like Asteroides' active-effect countdown? Restate explicitly: score, lives, and level are **never** drawn in canvas in this codebase — that's the HUD's job, non-negotiable across all three engines — so this question is only about game-state indicators, not stats.

### Restate as fixed, don't turn into questions

Read these back to the user as settled, inherited from the three existing engines:

- The HUD (`.player-hud`: player/score/lives/level + `PAUSA`/`FIN`/`SALIR`) is untouched. No new HUD block for this game.
- No pause control inside `.crt-screen` — only the existing `EN PAUSA` overlay.
- `lib/<slug>.ts` is a pure module: no `document`, `window`, `canvas`. State mutates in place, read through a `useRef` in the component — never `useState` per frame.
- The component's props are exactly the current `EngineProps` from `components/game-player.tsx`: `{ paused, onTogglePause, onRun, onOver, initialLives, maxLevel }`. `onRun` fires only when `score`/`lives`/`level` actually change (the `publish()` pattern), never every frame.
- Score saving (`save_score` RPC, record-only), the plays counter (`increment_game_plays` on mount), and the mobile fullscreen button are automatic the moment the game has an `ENGINES` row and a `public.games` row — no new code path for any of them, and no section about them in the new spec beyond confirming nothing about the new game's contract breaks them.
- No sound, ever — an explicit repo-wide decision (SPEC 15 §6).
- Sessions, `localStorage`, and auth are untouched by adding a game.

## Phase 3 — Write the spec

Follow `/spec`'s Phase 3 rule verbatim: write the whole thing and skip to Phase 4 once Phase 2 is genuinely closed (you can answer which files change, what the first/last executable steps are, and how to verify it's done); only go section-by-section if something is still missing.

Use specs 13–15's section shape as the concrete precedent for a game spec — richer than `template.md`'s generic shape, and this repo's established voice for this exact kind of feature:

1. **Header** — state `Borrador`, depends-on (at least SPEC 01, SPEC 04, plus every prior game spec — a new engine always depends on the `ENGINES` registry pattern SPEC 13/14/15 built), date, one-sentence objective.
2. **§1 Punto de partida** — a table of what's reused untouched (HUD, modal, `EngineProps`, `runKey` remount, fullscreen wrapper) and a measured side-effects table like SPEC 13 §1.4 / SPEC 14 §1.3 / SPEC 15 §1.3: which test counts shift, which reference screenshots regenerate, whether the home page or `/salon` default tab move.
3. **§2 Alcance** — in / out, explicit. "Fuera" always includes: persisting scores beyond what `save_score` already does automatically, sound, any mechanic the reference doesn't have, converting other decorative games.
4. **§3 Diseño** — catalog row (real values for every NOT NULL column), the engine module with real function signatures (mirror the `export function ...` blocks in specs 13–15, not prose), the component's structure (loop, `publish()`, keyboard, pointer/touch controls), board/control layout with real pixel math at 1440px and 390px if the aspect ratio isn't a plain `4/3` (copy the arithmetic-table style of SPEC 13 §3.4 / SPEC 14 §3.4), color tokens, the `ENGINES` registry addition (one new row, `screen` empty string if no modifier needed), tests, docs updates.
5. **§4 Plan de implementación** — numbered, each step leaves the project compiling, each with its own manual/automated check (mirror specs 13–15's per-step "Comprobación:").
6. **§5 Criterios de aceptación** — boolean checklist, as dense as specs 13–15's (30+ items is normal for this family of spec).
7. **§6 Decisiones** — Sí/No pairs with reasons. This is deliberately the longest section in every precedent spec; match that density, don't compress it.
8. **§7 Riesgos** — table, only the non-obvious ones (tunneling through fast-moving objects, RAF surviving unmount, screenshot regressions, mobile touch-target sizing — whichever actually apply here).

**Do not forget, because they're easy to drop between phases:**

- The exact `public.games` migration: the new row's values for every NOT NULL column found in Phase 1 (`slug`, `nombre`, `niveles`, `vidas`, `categoria_id`, `color`, `cover`, `image`, `short`, `long`, `dificultad`, `jugadores`, `perifericos`), each CHECK-constraint-valid — and the reminder that per `CLAUDE.md`'s "Database first, code second" this migration is pushed with `supabase db push` **before** merging to `main`, and must be additive/backward-compatible like every other migration in this repo.
- Which existing test counts need bumping (found by grep in Phase 1, not by trusting specs 13–15's line numbers) and which reference screenshots are affected — confirm against the Phase 1 finding on whether home still slices the game list.
- A new `describe` block for the game's own tests: unfrozen clock (the engine needs a live `requestAnimationFrame`), no screenshot of the live board (random/continuous state), and the cross-engine "HUD is identical across every playable game" comparison test SPEC 15 §3.8 added — extend it to include the new game.

## Phase 4 — Save the spec

Identical mechanics to `/spec`'s Phase 4: next sequential number from the `specs/` listing above, slug from the objective, `Borrador` state, seed `specs/.spec-config.yml` if it's missing (leave it untouched if it exists), confirm the path and the reminder to approve it, name `/spec-impl NN-slug` as the next step. **Stop there** — do not propose implementing the spec or writing any code.

## Hard rules

- **Never write code.** Only the spec's `.md` file, at the end.
- **Never re-ask what the three existing engines already answer unanimously.** State the inherited default back to the user instead (see the "Restate as fixed" list in Phase 2).
- **Never trust specs 13–15's prose about the catalog over the live code.** They predate the Supabase migration; always re-verify file paths, line numbers, and the "does home slice the list" question against the current repository.
- **Never invent a `public.games` value that doesn't satisfy the live CHECK constraints found in Phase 1.**
- **If the requested game has no reference implementation to port,** say so explicitly before Phase 2 — designing physics/rules from scratch is a bigger spec than any of the three precedents and probably deserves being flagged as such rather than quietly answered in a couple of question blocks.

## Arguments

`$ARGUMENTS` is the game idea, working title, or a pointer to a reference to port — not a slug. If empty, ask for a one-sentence description plus whether a reference implementation already exists under `references/started-games/`.
