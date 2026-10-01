# Game suggestions ledger

This is the memory of the **`game-planner`** subagent (`.agents/agents/game-planner.md`): every game it
has ever put on the table for Arcade Vault's catalog, accepted or rejected, with the reason. The agent
starts cold on each run and reads this file before thinking about anything, so an idea recorded here is
one it will not re-litigate — and a rejection recorded here only reopens when the fact behind it
changes.

**The four shipped games are deliberately not listed here.** `TETRIX`, `ASTEROIDES`, `ARKANOID` and
`BUSCAMINAS` live in `supabase/migrations/*catalogo*.sql`, which is their source of truth, and their
rules live in [`games.md`](games.md). This file is for ideas, not for what already exists.

The chain is **`game-planner` (which game) → `/add-game` (the spec) → `/spec-impl` (the code)**. Nothing
in this file is a spec, and nothing in it has been agreed to be built.

## Statuses

| Status        | Meaning                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| `Proposed`    | On the shortlist, passed every hard gate, not picked as the recommendation.        |
| `Recommended` | Was the agent's number one on the run that proposed it. Still not a commitment.   |
| `Rejected`    | Failed a hard gate, or lost on the soft criteria. The reason is in its section.    |
| `Speccing`    | A spec exists at `specs/NN-slug.md`. Link it from the entry.                       |
| `Shipped`     | In the catalog and playable. The entry stays as history; the migration is the truth. |

## Index

| #   | Name      | Slug        | Category | Status      | Proposed   | Verdict                                                          |
| --- | --------- | ----------- | -------- | ----------- | ---------- | ---------------------------------------------------------------- |
| 1   | SERPIENTE | `serpiente` | ARCADE   | Shipped     | 2026-09-28 | Fills the unused `dificultad = 1`, a new verb, the smallest rules surface of the five engines |
| 2   | RANA      | `rana`      | ARCADE   | Proposed    | 2026-09-28 | Zero RNG, the best determinism handle on the shortlist; largest rules surface of the three |
| 3   | SIMÓN     | `simon`     | ARCADE   | Proposed    | 2026-09-28 | Cheapest engine possible, but the leaderboard compresses at the human memory ceiling |
| 4   | DUELO     | `duelo`     | VERSUS   | Rejected    | 2026-09-28 | Gate 7 — two seats, one Supabase session, one `auth.uid()`: the second player has no leaderboard identity |
| 5   | INVASORES | `invasores` | SHOOTER  | Rejected    | 2026-09-28 | Soft criteria — repeats `ASTEROIDES`' category and its aim-and-shoot verb |
| 6   | ANTIMISIL | `antimisil` | SHOOTER  | Rejected    | 2026-09-28 | Soft criteria — second shooter, and its pointer aim duplicates `BUSCAMINAS`' input model |
| 7   | ALMACÉN   | `almacen`   | PUZZLE   | Rejected    | 2026-09-28 | Gate 5 — hand-made levels terminate, and `PUZZLE` already carries two entries |
| 8   | LABERINTO | `laberinto` | ARCADE   | Rejected    | 2026-09-28 | Soft criteria — rules surface above `lib/arkanoid.ts`, the largest precedent, designed from nothing |

## Suggestions

### 01 — SERPIENTE

- **Pitch** — A neon snake that never stops moving across a grid, growing with every fruit until it
  steers into a wall or into its own body.
- **Gap it fills** — Takes `dificultad = 1`, the only unused difficulty; puts a second entry in the
  thin `ARCADE` column instead of growing `PUZZLE` to three; and adds a verb none of the four has —
  continuous grid traversal where your own past path is the hazard. Its input model is a third kind:
  a **latched direction**, neither `TETRIX`'s ~110 ms repeat-while-held nor `ASTEROIDES`/`ARKANOID`'s
  per-frame held state.
- **Proposed catalog row**
  | column | value |
  | --- | --- |
  | `slug` | `serpiente` |
  | `nombre` | `SERPIENTE` |
  | `niveles` | `null` |
  | `vidas` | `1` |
  | `categoria_id` | `ARCADE` |
  | `color` | `green` |
  | `cover` | `cover-serpiente` |
  | `image` | `/juegos/serpiente.png` |
  | `short` | `Crece sin morderte la cola ni chocar contra el muro.` |
  | `long` | `Una serpiente de neón recorre una rejilla y nunca se detiene: gírala para atrapar la fruta y hacerla más larga. Cada pocas frutas sube el nivel y avanza más rápido, sin final. Una sola vida: chocar contra el muro o contra tu propio cuerpo termina la partida.` |
  | `dificultad` | `1` |
  | `jugadores` | `1` |
  | `perifericos` | `array['teclado']` |

  All four `color` values are taken, so a fifth game must reuse one. `green` is reused from
  `BUSCAMINAS` deliberately: `BUSCAMINAS` is `PUZZLE` and `SERPIENTE` is `ARCADE`, so the two greens
  never appear together under a category filter in `LibraryBrowser`.

- **Gates** — Passes all eight. Gate 1 comfortably: no DOM, and fruit placement through
  `Math.random()` is already precedented in `lib/buscaminas.ts`. Gates 4 and 5 cleanly — the score is
  monotone, the level is unbounded, there is no win state. Gate 8: `serpiente` is free in the live
  catalog and in this ledger, and no registered title is involved. Gate 2 passes **conditionally** —
  see the first risk.
- **Risks**
  - The "no modifier" verdict depends entirely on grid resolution. At 390 px the 4/3 tube leaves
    ~292 px of height minus the pad strip; a 24 × 18 grid lands near 14 px cells. A coarser ~20 × 15
    (≈17 px) keeps it modifier-free — otherwise it buys a `serpiente` modifier like `tetris`/`rocks`/
    `minas` and the cost drops. That arithmetic belongs in the spec, not in a guess.
  - Direction input must **queue**, not overwrite. Two turns inside one tick with a single slot let
    the snake reverse into its own neck — the classic bug, invisible until a fast player finds it.
  - Arrow keys scroll the page; `preventDefault` as the four shipped engines already do (gate 3).
- **Cost** — No new `.crt-screen` modifier (following `ARKANOID`'s `ark-stage` pattern: a
  height-driven 4/3 board with the pad in a strip below, never a side column). No new color token, no
  new `categorias` row. New: a `cover-serpiente` class in `app/globals.css` and a PNG in
  `public/juegos/` — both of which all four precedents also have. Rules surface is the **smallest of
  the five engines**, under `lib/buscaminas.ts`'s 247 lines.
- **Decision** — `Shipped`, 2026-10-01 (`Recommended`, 2026-09-28). Top of the shortlist at 24
  points: it is the only candidate that fills an actually empty column (`dificultad = 1`) while
  bringing a new verb, a new input model and the cheapest engine but one. Prototype ported to
  [`06-serpiente/`](06-serpiente/); the catalog row is the migration's, not this entry's.

### 02 — RANA

- **Pitch** — A frog crosses six lanes of traffic and a river of drifting logs to reach the refuges,
  and the traffic never stops getting faster.
- **Gap it fills** — `ARCADE`, and a verb built purely on timing a gap rather than on reflex
  (`ASTEROIDES`), aim (`ARKANOID`) or deduction (`BUSCAMINAS`). Its `dificultad = 3` collides with
  `ARKANOID`, which is exactly why it scores below `SERPIENTE` on the double-weighted column.
- **Proposed catalog row**
  | column | value |
  | --- | --- |
  | `slug` | `rana` |
  | `nombre` | `RANA` |
  | `niveles` | `null` |
  | `vidas` | `3` |
  | `categoria_id` | `ARCADE` |
  | `color` | `magenta` |
  | `cover` | `cover-rana` |
  | `image` | `/juegos/rana.png` |
  | `short` | `Cruza el tráfico y el río sin que te atropellen ni te hundas.` |
  | `long` | `Seis carriles de coches y un río de troncos separan a la rana de su refugio. Salta casilla a casilla, calcula el hueco y aprovecha la corriente. Cada refugio completo sube el nivel: el tráfico acelera y los troncos se acortan, sin final. Tres vidas; a la tercera, se acabó.` |
  | `dificultad` | `3` |
  | `jugadores` | `1` |
  | `perifericos` | `array['teclado']` |

  `magenta` is reused from `TETRIX`, which is `PUZZLE` — so the two never share a category filter.

- **Gates** — Passes all eight. Gate 5 only **barely**: filling the refuges is a level completion,
  and it must reseed with a faster lane table the way `BUSCAMINAS` reseeds on a cleared grid —
  otherwise it is a terminal win state and the leaderboard ties.
- **Risks**
  - Riding a log has to advance the frog inside the **same** `step()` as the log, never in a second
    pass, or it desyncs by a frame at high speed and drowns on solid wood.
  - Lanes wrap and speeds are bounded, so there is no tunneling problem of the kind `ARKANOID` solves
    with 8 px substeps — worth stating so nobody reimplements that machinery here.
- **Cost** — No new modifier (the `ark-stage` column pattern again), no new color token, no new
  `categorias` row. Rules surface is the largest of the three, roughly `lib/arkanoid.ts`'s 459 lines,
  because the per-level lane table is real content rather than a formula.
- **Decision** — `Proposed`, 2026-09-28. Second at 22 points. It wins the determinism column outright
  — with no RNG at all, a Playwright test can assert an exact score — but it lands on an occupied
  difficulty and carries the biggest rules surface of the shortlist.

### 03 — SIMÓN

- **Pitch** — Four panels light in a sequence that grows by one every round; repeat it exactly or the
  run ends.
- **Gap it fills** — `ARCADE` and `dificultad = 1`, with a memory verb nothing in the catalog
  touches. Its input is a discrete press through either keyboard or pointer, closest to
  `BUSCAMINAS`' dual path.
- **Proposed catalog row**
  | column | value |
  | --- | --- |
  | `slug` | `simon` |
  | `nombre` | `SIMÓN` |
  | `niveles` | `null` |
  | `vidas` | `1` |
  | `categoria_id` | `ARCADE` |
  | `color` | `yellow` |
  | `cover` | `cover-simon` |
  | `image` | `/juegos/simon.png` |
  | `short` | `Repite la secuencia de luces sin fallar una sola vez.` |
  | `long` | `Cuatro paneles de color se encienden en un orden que crece con cada ronda. Míralo, memorízalo y repítelo con el teclado o con el ratón. Cada ronda superada añade un destello más y acorta la espera entre ellos. Una sola vida: un panel equivocado y la partida termina.` |
  | `dificultad` | `1` |
  | `jugadores` | `1` |
  | `perifericos` | `array['teclado', 'raton']` |

  The `slug` is ASCII on purpose (`simon`, not `simón`): it is a route segment for `/juego/[id]` and
  `/jugar/[id]`. `yellow` is reused from `ASTEROIDES`, which is `SHOOTER`.

- **Gates** — Passes all eight, two of them **barely**. Gate 5: there is no terminal win state, but
  human memory caps real runs around 20–25 rounds, so the top of the leaderboard compresses into a
  tie — legal, and still the weakest leaderboard of the three. Gate 2: four panels inside a 4/3 tube
  is correct but visually sparse next to the other four screens.
- **Risks**
  - Gate 6 removes sound, which is the *entire* second channel of the original. Each panel needs a
    distinct glyph or position, not just a hue, or the game is unplayable for a colour-blind player.
  - The playback clock is the only clock, and `game-player.tsx` also sets `paused` when the `FIN`
    modal opens — so a pause mid-sequence must freeze it without losing it.
- **Cost** — The cheapest of everything considered: no modifier, no color token, no `categorias` row,
  and a rules module well under 150 lines, far below `lib/buscaminas.ts`.
- **Decision** — `Proposed`, 2026-09-28. Third at 21 points. Maximum mechanical distance and minimum
  cost, but the thinnest leaderboard and a determinism handle that couples a test to a seed's
  expansion rather than to something as simple as `ARKANOID`'s non-random `serve()`.

### 04 — DUELO

- **Pitch** — Two paddles, one keyboard, a ball between them: the hot-seat duel that would fill the
  empty `VERSUS` category and the unused `jugadores = 2`.
- **Gap it fills** — On paper, the two emptiest slots in the catalog at once. That is exactly why it
  was evaluated rather than skipped.
- **Proposed catalog row** — Not carried forward. `slug` would be `duelo`, `categoria_id` `VERSUS`,
  `jugadores` `2`; the row is moot because the candidate fails a hard gate.
- **Gates** — **Fails gate 7**, and would fail gate 5 as usually designed. Two players on one
  keyboard share **one** Supabase session, so `save_score` can only ever credit `auth.uid()`: the
  second seat has no leaderboard identity and the run produces two scores where the RPC accepts one.
  A "first to N" rally is also a terminal win state that caps the score. It additionally repeats
  `ARKANOID`'s paddle verb, so even a fixed scoring model would score 1 on mechanical distance.
- **Risks** — The real risk is the temptation: `VERSUS` being empty makes any two-player idea look
  like the obvious pick. It is not. The `VERSUS` column and `jugadores = 2` stay empty **on purpose**
  until the schema carries a per-seat score, which is product and migration work outside this
  agent's scope.
- **Cost** — Not assessed; eliminated at the gate.
- **Decision** — `Rejected`, 2026-09-28. Gate 7. Reopens only if `scores` grows a way to record a
  second player, or if a genuinely single-score two-player design appears — not merely because
  `VERSUS` is still empty next month.

### 05 — INVASORES

- **Pitch** — A descending formation of aliens, a gun that slides along the bottom, and shields that
  erode shot by shot.
- **Gap it fills** — None that matters. `SHOOTER` is already `ASTEROIDES`'.
- **Proposed catalog row** — Not carried forward.
- **Gates** — Passes all eight. It was eliminated on the soft criteria, not at a gate.
- **Risks** — n/a.
- **Cost** — Would have been moderate: a 4/3 board, no modifier, a formation table.
- **Decision** — `Rejected`, 2026-09-28. Lost on soft criteria: the category is occupied and the verb
  is `ASTEROIDES`' own aim-and-shoot, so mechanical distance scores 2 and the weighted gap column
  scores 2. A fifth game that repeats a verb is a weak fifth game.

### 06 — ANTIMISIL

- **Pitch** — Incoming missiles rain on six cities and you intercept them by placing explosions with
  a cursor.
- **Gap it fills** — None that matters; `SHOOTER` again, and its pointer aim is `BUSCAMINAS`' input
  model.
- **Proposed catalog row** — Not carried forward.
- **Gates** — Passes all eight, including gate 8 (`ANTIMISIL` is an invented Spanish name, not the
  registered title it derives from). Eliminated on the soft criteria.
- **Risks** — n/a.
- **Cost** — Would have been low: a 4/3 board with no modifier and cities mapping neatly onto
  `vidas`, which is the one genuinely elegant thing about it.
- **Decision** — `Rejected`, 2026-09-28. Lost on soft criteria: second shooter in an occupied
  category, and a pointer-targeting input that duplicates `BUSCAMINAS`. Worth reopening only if
  `SHOOTER` is ever the thinnest column rather than the second-thinnest.

### 07 — ALMACÉN

- **Pitch** — Push crates onto their marks in a warehouse without wedging one into a corner.
- **Gap it fills** — None. `PUZZLE` already carries `TETRIX` and `BUSCAMINAS`, two of the four
  shipped games.
- **Proposed catalog row** — Not carried forward.
- **Gates** — **Fails gate 5.** Hand-made levels terminate, which caps the score and ties the
  leaderboard. Making it endless requires generating solvable levels, which needs a solver — a scope
  materially larger than any of the four precedents and larger than every other candidate here.
- **Risks** — Not assessed; eliminated at the gate.
- **Cost** — Not assessed; eliminated at the gate.
- **Decision** — `Rejected`, 2026-09-28. Gate 5, compounded by a saturated category. Reopens only if
  someone brings a generated-and-verified endless level source, not merely a bigger level pack.

### 08 — LABERINTO

- **Pitch** — Eat every pellet in a maze while four pursuers with distinct personalities hunt you
  down.
- **Gap it fills** — `ARCADE`, with a genuinely new verb (evasion under pursuit). The gap is real;
  the price is not.
- **Proposed catalog row** — Not carried forward.
- **Gates** — Passes all eight, including gate 8 provided the name stays `LABERINTO` and never the
  registered title it derives from. Eliminated on the soft criteria.
- **Risks** — The pursuer AI is the whole game: get it wrong and it is either trivial or unfair, and
  neither failure is visible from the rules module in isolation.
- **Cost** — The reason it lost. Maze representation, per-pursuer targeting, pellet and power-pellet
  state and a scatter/chase timer add up to a rules surface **above** `lib/arkanoid.ts`'s 459 lines,
  the largest precedent — and with no folder in `references/started-games/` to port from, all of it
  is designed from nothing. Prototype scores 1 and cost scores 2.
- **Decision** — `Rejected`, 2026-09-28. Lost on cost, not on a gate. This is the strongest of the
  rejected five and the one most worth revisiting once the catalog can absorb a large spec; it is not
  a bad game, it is a big one.

<!--
Entry shape, one per candidate, numbered sequentially and never reused:

### NN — NAME

- **Pitch** — one sentence.
- **Gap it fills** — which column, category, verb or input model none of the shipped games occupy.
- **Proposed catalog row** — every NOT NULL column of `public.games` with CHECK-valid values:
  `slug`, `nombre`, `niveles`, `vidas`, `categoria_id` (by name), `color`, `cover`, `image`,
  `short`, `long`, `dificultad`, `jugadores`, `perifericos`.
- **Gates** — which of the eight hard gates it passes, and any it barely passes.
- **Risks** — the non-obvious ones only.
- **Cost** — new `.crt-screen` modifier? new color token? new `categorias` row? rules surface next to
  `lib/arkanoid.ts` or `lib/buscaminas.ts`?
- **Decision** — status, one-line verdict, and the date (`date +%F`) it was set.
-->
