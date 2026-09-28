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

| #   | Name | Slug | Category | Status | Proposed | Verdict |
| --- | ---- | ---- | -------- | ------ | -------- | ------- |
| —   | —    | —    | —        | —      | —        | Empty ledger: `game-planner` has not run yet. |

## Suggestions

_No entries yet._

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
