---
name: spec-impl-game
description: Orquesta el pipeline completo de llevar al catálogo el juego mejor puntuado en references/started-games/suggestions-games.md — porta un prototipo JS, lo verifica en local, encadena /add-game y /spec-impl para el spec real y la implementación, encadena arcade-performance-booster y arcade-contract-auditor en serie, pide una segunda verificación local y termina pasando tests y abriendo la PR. Nunca toca el proyecto remoto de Supabase ni mergea por su cuenta.
disable-model-invocation: true
argument-hint: "[slug opcional de suggestions-games.md para forzar qué sugerencia implementar]"
allowed-tools: Read, Glob, Grep, Edit, Write, AskUserQuestion, Agent, Skill, Bash(git status:*), Bash(git branch:*), Bash(git checkout:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git log:*), Bash(git diff:*), Bash(ls:*), Bash(cat:*), Bash(date:*), Bash(npx tsc:*), Bash(npm run lint:*), Bash(npm test:*), Bash(gh pr create:*)
---

# /spec-impl-game — Orchestrator from suggestion to PR

You drive the full pipeline that turns the top entry of `references/started-games/suggestions-games.md`
into a shipped, tested, PR-ready game. You are "based on `/spec-impl`" in spirit: the same discipline of
explicit approval gates, never silently proceeding, never inventing what the user didn't confirm — but
your job is wider, because you also chain `/add-game`, `/spec-impl`, and two audit subagents end to end,
and you are the only one of the three game-related skills that ever creates a git commit.

**You never replace `/add-game` or `/spec-impl` — you call them.** Use the Skill tool (`skill: "add-game"`,
`skill: "spec-impl"`) at the phases below and let each run its own full logic, including its own
`AskUserQuestion` blocks. Do not pre-answer their questions and do not duplicate their phases here.

**You never replace `arcade-performance-booster` or `arcade-contract-auditor` either** — you call them
with the Agent tool, by name, one after the other, and read their reports.

## Session context

```
!`git status --short`
!`git branch --show-current`
!`ls references/started-games/`
!`cat specs/.spec-config.yml 2>/dev/null || echo "AutoCreateBranch: true (default, no config file)"`
```

## Hard rules that hold across every phase

- **One game per run.** If `$ARGUMENTS` is empty, you pick automatically (Phase 0); if given, it must
  resolve to one existing, non-`Shipped` ledger entry.
- **Two blocking verifications, never skipped.** Phase 2 and Phase 7 require an explicit "sí, continúa"
  from the user — not silence, not an assumption. On rejection you iterate the phase you're in; you never
  route around the rejection by quietly moving on.
- **Commits only at four defined checkpoints**, never mid-step: end of Phase 2, end of Phase 3, end of
  Phase 5, end of Phase 6. Every other phase (`/add-game`, `/spec-impl`'s own step loop) leaves commits to
  whoever owns that phase, unchanged from their own documented behavior.
- **Never touch the remote Supabase project.** No `supabase db push`, no `functions deploy`, ever, from
  this skill. Phase 8 prints the checklist and waits.
- **Never merge, never close the spec to `Implementado`, never touch the README index, never delete a
  branch.** Your scope ends when the PR is open, same boundary `/spec-impl` already draws for itself one
  layer in.
- **Never delete a ledger entry.** Phase 3 only flips its `Status` to `Shipped` — deleting it would make
  `game-planner` re-propose the same game later, since the ledger is its only memory across runs.

## Phase 0 — Pick the target game

1. Read `references/started-games/suggestions-games.md`'s `## Index` table in full.
2. If `$ARGUMENTS` names a slug: find that row. If it doesn't exist, stop and say so. If its `Status` is
   already `Shipped`, stop — it's already in the catalog, nothing to do.
3. If `$ARGUMENTS` is empty: scan the Index rows in table order (the order `game-planner` already ranked
   them in). Pick the first row with `Status = Recommended`. If there is none, pick the first row with
   `Status = Proposed`. If neither exists (everything is `Rejected`/`Speccing`/`Shipped`), stop and tell
   the user to run the `game-planner` subagent first — never resurrect a `Rejected` entry and never invent
   a candidate that isn't in the ledger.
4. Read that entry's full `### NN — NAME` section (Pitch, Gap it fills, Proposed catalog row, Gates,
   Risks, Cost, Decision) and print a short summary of what you're about to build, so the user sees it
   before anything is written. This is informational, not a question — automatic selection is what was
   asked for.
5. Check `git status --short` from the session context. If it's not clean, stop and ask what to do with
   the pending changes — never stash or commit them yourself.

## Phase 1 — Port the JS prototype

1. List `references/started-games/`, find every `NN-slug` folder, take the highest `NN`, and use `NN + 1`
   (zero-padded to 2 digits) as the new folder's number. As of this writing the newest is `05-buscaminas`,
   so the next is `06`.
2. `git checkout -b add-<slug>-reference` off the current (clean) branch — this mirrors the real
   `add-buscaminas-reference` precedent, and is the branch `/spec-impl` will later branch its own
   `spec-NN-slug` from in Phase 5, so both land in the same eventual PR.
3. Write `references/started-games/NN-slug/`:
   - `game.js` — the whole game. No build step, no dependencies, no framework. A single
     `requestAnimationFrame` loop. **Score/lives/level are never drawn inside the canvas** — only through
     a DOM side panel and/or a full-canvas end overlay, exactly like `05-buscaminas/game.js`'s
     `drawOverlay()`/`refreshSideHud()` split. Base the actual mechanic on the ledger entry's Pitch/Gap
     it fills/Risks prose from Phase 0 — that prose already describes the rules in enough detail to
     implement.
   - `index.html` — loads `game.js`, a `.layout` flex row with the canvas and an `<aside class="controls">`
     for touch, same shape as the precedent.
   - `README.md` — Descripción / Tecnologías / Cómo correr (`npx serve .` or open directly) / Controles /
     Puntuación / Características, same section order as `05-buscaminas/README.md`.
   - `CLAUDE.md` — architecture notes for whoever ports this into React next: board/state shape, the game
     loop, input handling (`keys`/`justPressed`/`pressed()` pattern if there's repeat-while-held input),
     scoring formula, win/lose conditions, tunable constants — same section order as
     `05-buscaminas/CLAUDE.md`, since that file is exactly what `/add-game`'s own Phase 1 will read later
     when it looks for "a matching folder to port".
   - `.gitignore` — copy the one-line precedent (`.DS_Store` etc.) from an existing folder.
4. Do not commit yet.

## Phase 2 — First local verification (blocking)

Tell the user exactly how to run it:

```
Prototipo listo en references/started-games/NN-slug/. Pruébalo con:
  npx serve references/started-games/NN-slug
o abriendo references/started-games/NN-slug/index.html directamente.
¿Lo apruebo para continuar?
```

Wait for an explicit answer.

- **Rechazado:** vuelve a la Fase 1 con lo que el usuario señale que está mal. Nada se ha comiteado, así
  que no hay que deshacer nada.
- **Aprobado:** `git add references/started-games/NN-slug/` y
  `git commit -m "feat: add <SLUG> reference game prototype"` (mismo mensaje que el precedente real),
  permaneciendo en `add-<slug>-reference`.

## Phase 3 — Ledger update

Edit `references/started-games/suggestions-games.md`:

- In the `## Index` table, change that row's `Status` cell to `Shipped`.
- In its own `### NN — NAME` section, update the `- **Decision**` line to reflect `Shipped` too (keep the
  original date, add today's date for the status change if the entry's convention supports a second
  date — otherwise just update the word).
- **Never delete the section or the row.** The file's own `## Statuses` table defines `Shipped` as "in the
  catalog and playable — the entry stays as history; the migration is the truth." That's the behavior to
  match, not the user's literal "borrar" — already confirmed with the user.

Commit: `git commit -m "docs: mark <SLUG> as shipped in suggestions ledger"`.

## Phase 4 — Spec: invoke `/add-game`

Call the Skill tool: `skill: "add-game"`, `args: "<nombre del juego, p. ej. SERPIENTE>"`.

Let it run its own four phases completely — loading the live contract, asking its own grounded
`AskUserQuestion` blocks, writing `specs/NN-slug.md` in state `Borrador`. You do not answer its questions
for it and you do not write to `specs/` yourself.

When it reports the spec's path, tell the user:

```
Spec escrita en specs/NN-slug.md (Borrador). Revísala y, si estás de acuerdo, cambia su cabecera a
Aprobado antes de que continúe con /spec-impl.
```

Wait for the user to confirm the spec is now `Aprobado` before moving to Phase 5. Never flip the state
yourself — approving spec content is a human call, the same boundary `/spec-impl` itself refuses to cross.

## Phase 5 — Implementation: invoke `/spec-impl`

Call the Skill tool: `skill: "spec-impl"`, `args: "NN-slug"` (the spec from Phase 4, now Approved).

Let it run its own four phases completely: validate the state, create/switch to `spec-NN-slug` (branching
from `add-<slug>-reference`, so the prototype and ledger commits ride into the same final PR), and walk
its implementation plan step by step with its own mandatory diff-review pause after every step. Do not
override that rhythm, do not commit mid-plan, do not answer on the user's behalf when it stops for
ambiguity.

This is where `components/<slug>-game.tsx`, `lib/<slug>.ts`, the `ENGINES` row in
`components/game-player.tsx`, the catalog migration, and the `tests/screens.spec.ts` block all get written
— because that's what the spec's own plan commits to doing.

Once `/spec-impl` reports all plan steps implemented and the user has reviewed the final diff it surfaced,
commit: `git commit -m "feat(spec-NN-slug): <objetivo resumido del spec>"` (matches the real
`feat(spec-24): ...` precedent style).

## Phase 6 — Contract checks, strictly in series

Run these one after another — **never in parallel**, because the second must see whatever the first
changed:

1. `Agent({ subagent_type: "arcade-performance-booster", prompt: "Juego objetivo: <slug>." })`. Wait for
   its full report before doing anything else.
2. Only then: `Agent({ subagent_type: "arcade-contract-auditor", prompt: "Juego objetivo: <slug>." })`.
   Wait for its full report.

Surface every finding either one reports but doesn't fix — the auditor's V1–V3 verify-only rows
(migration/cover image/test block), anything marked as a risk — plainly to the user. Don't swallow them
into a generic "all good."

If either agent changed files, commit: `git commit -m "fix(<slug>): performance + contract audit"`.

## Phase 7 — Second local verification (blocking)

```
Motor implementado y auditado. Pruébalo de verdad con npm run dev: escritorio y también el viewport
móvil (≤ 720px), porque justo eso es lo que audita arcade-contract-auditor. ¿Lo apruebo para continuar?
```

Wait for an explicit answer.

- **Rechazado:** arregla lo señalado; si el arreglo pudo haber roto algo que ya auditaste, vuelve a correr
  el agente relevante (no hace falta repetir los dos si solo uno aplica) antes de volver aquí.
- **Aprobado:** continúa a la Fase 8. No hace falta comitear aquí — no hay cambios nuevos salvo que la
  corrección de un rechazo haya introducido alguno, en cuyo caso coméntalo y comitea con un mensaje que
  describa el arreglo concreto.

## Phase 8 — Tests, push, PR

1. Run, stopping at the first failure and handing control back to the user:
   `npx tsc --noEmit`, then `npm run lint`, then `npm test` (remind that the local Supabase/Docker stack
   must be up — `pretest` resets the local DB).
2. If the spec added a migration — it will, every new catalog entry is one — print this checklist and
   **wait for the user's explicit confirmation it's done** before anything else. Never run it yourself:

   ```
   La spec trae una migración (alta en public.games). Antes de mergear tienes que subirla al proyecto
   remoto:
     npx supabase link --project-ref <ref-prod>
     npx supabase db push
     npx supabase functions deploy <nombre>   # solo si la spec tocó Edge Functions
   Avísame cuando lo hayas hecho.
   ```

3. On confirmation: `git push -u origin spec-NN-slug`, then `gh pr create` with a title summarizing the
   spec's objective and a body with a test-plan checklist, matching this project's usual PR shape. Return
   the PR URL to the user.
4. Close with what's still manual, out of this skill's scope:

   ```
   PR abierta: <url>. Lo que queda, y que no hace esta skill:
   - Esperar a que CI pase en verde.
   - Mergear a main.
   - Comprobar en producción (incluyendo /auth con OAuth e invitado).
   - Cerrar la spec a Implementado y actualizar el índice de specs en README.md.
   - Borrar la rama spec-NN-slug y hacer npx supabase unlink.
   ```

## Summary of expected behavior

A full run, nothing rejected: Phase 0 picks `SERPIENTE` (Recommended) → Phase 1 writes
`references/started-games/06-serpiente/` on branch `add-serpiente-reference` → Phase 2 user approves,
commit → Phase 3 flips the ledger entry to `Shipped`, commit → Phase 4 calls `/add-game`, which asks its
own questions and writes `specs/25-serpiente.md` in `Borrador`; user reviews and marks it `Aprobado` →
Phase 5 calls `/spec-impl 25-serpiente`, which branches to `spec-25-serpiente` and implements step by
step with its own diff reviews; once done, commit → Phase 6 runs `arcade-performance-booster` then
`arcade-contract-auditor` on `serpiente` in series; if either changed files, commit → Phase 7 user plays
it locally on desktop and mobile, approves → Phase 8 runs `tsc`/`lint`/`test`, prints the remote-migration
checklist, waits for confirmation, pushes, opens the PR, and lists the remaining manual steps.

Any rejection at Phase 2 or Phase 7 loops back into the phase being verified — it never silently continues
past a "no."
