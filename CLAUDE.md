# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Arcade Vault — an arcade gaming platform where players compete for high scores. The five screens are ported from the HTML/JSX mockup in `references/templates/` and are fully navigable: library with search and category filters, game detail with a leaderboard, a CRT player, a sign-in form, and a hall of fame.

Everything below the UI is simulated. There is no backend, database, or API: the eight games are decorative (no game engine — the player animates a CRT scene and increments the score on a timer), the session is fake and lives in `localStorage` under `av_user`, and leaderboard rows are produced by a deterministic LCG in `lib/scores.ts` and never persisted. Treat those as deliberate boundaries; a spec decides when one of them changes.

The project follows **spec-driven development**. Write a spec before implementing a feature — see the spec workflow section below.

UI work uses the **`/frontend-design`** skill: invoke it before building any new UI or reshaping existing screens, so the visual direction (typography, color, layout) is intentional rather than a templated default.

For deeper UI/UX decisions — design systems, component patterns, accessibility, responsive layout, charts, font pairings, palettes — use the **`/ui-ux-pro-max`** skill. It carries searchable local data (styles, palettes, font pairings, UX guidelines, icons, chart types, stack-specific implementation) and pairs with `/frontend-design`: `/frontend-design` sets the aesthetic direction, `/ui-ux-pro-max` supplies concrete patterns and reviews existing interfaces.

## Commands

```bash
npm run dev          # next dev — also regenerates the nextjs-agent-rules block in AGENTS.md
npm run build        # next build
npm run start        # next start (requires a prior build)
npm run lint         # eslint (flat config; no --dir arg, lints the whole project)
npm test             # playwright test — both projects
npm run test:update  # playwright test --update-snapshots
npx tsc --noEmit     # typecheck; no npm script exists for this
```

Playwright is the only test runner here, and there are no unit tests — everything is end-to-end in `tests/screens.spec.ts`. Its `webServer` runs `npm run build` and then `next start -p 3100`, so `npm test` compiles a production build first and is slow. Expect minutes, not seconds.

## Architecture

Routes (App Router, URLs deliberately in Spanish):

| Route | File | Notes |
| --- | --- | --- |
| `/` | `app/page.tsx` | Hero plus `LibraryBrowser` |
| `/juego/[id]` | `app/juego/[id]/page.tsx` | Async page; `notFound()` when `getGame(id)` misses |
| `/jugar/[id]` | `app/jugar/[id]/page.tsx` | Async page; same `notFound()` guard |
| `/auth` | `app/auth/page.tsx` | Thin wrapper over `AuthForm` |
| `/salon` | `app/salon/page.tsx` | Thin wrapper over `HallOfFame` |
| — | `app/not-found.tsx`, `app/error.tsx` | 404 screen and error boundary (`error.tsx` is a client component) |

The route files under `app/` stay thin: they resolve params, fetch from `lib/`, and delegate to a component. Put behavior in `components/`, not in the page.

Nine components in `components/`. Seven are client components (`"use client"`) because they hold state or DOM handlers — `nav.tsx`, `session-provider.tsx`, `library-browser.tsx`, `game-card.tsx`, `game-player.tsx`, `auth-form.tsx`, `hall-of-fame.tsx`. Two are server components and should stay that way: `footer.tsx` and `leaderboard.tsx`, which renders rows it receives as props.

Three modules in `lib/`, all mock data:

- `games.ts` — `Game`, `GameColor`, `GameCat`, `CatFilter`, the `GAMES` array, `CATS`, and `getGame(id)`.
- `scores.ts` — `ScoreRow`, `PLAYERS`, `seededScores(seed, count)`, plus `detailSeed(gameId)` and `hallSeed(gameId)`. The seeds are inherited from the mockup; changing them rewrites every leaderboard in the app and every reference screenshot.
- `session.ts` — `SessionUser`, `SESSION_KEY`, `normalizeName`, `readSession`, `writeSession`, `subscribeSession`, `getSessionSnapshot`, `getServerSessionSnapshot`.

**Session rule:** components read session state through `useSession()` from `components/session-provider.tsx`. Never read or write `localStorage` directly inside a component — the provider exists to keep the server snapshot and the client snapshot from diverging during hydration.

## Stack and conventions

- **Next.js 16.3.5 App Router**, React 19.2.8, TypeScript strict mode. Everything lives under `app/`, `components/` and `lib/`; there is no `src/` directory and no Pages Router.
- The App Router pins its own React canary internally — the `react` version in `package.json` governs only Pages Router code, which this project does not use.
- **Styling is two layers that coexist.** `app/globals.css` holds a hand-written arcade theme of roughly 1,800 lines: `:root` design tokens, an `@theme inline` block, and semantic classes (`.av-*`, `.cover-*`, `.btn`, `.chip`, `.card`, `.field`). On top of that, JSX uses Tailwind v4 utilities for incidental layout (see `app/not-found.tsx`). Screen-level CSS stays in `globals.css` under its existing class names — do not convert it to utility soup, and do not fork a second theme into a component file.
- **Tailwind CSS v4** via `@tailwindcss/postcss`. There is no `tailwind.config.*`; configuration is CSS-first inside `app/globals.css` using `@import "tailwindcss"` and the `@theme inline` block. Add design tokens there as CSS custom properties on `:root` and expose them to utilities via `@theme inline`. The app is dark-only by design.
- Import alias `@/*` maps to the repo root (`tsconfig.json` paths), so `@/components/...`, `@/lib/...`.
- Layouts/pages receive typed props from Next-generated globals such as `LayoutProps<"/">` and `PageProps<"/juego/[id]">` (see `app/layout.tsx` and the dynamic routes) — these come from `.next/types`, so run `next dev` or `next build` at least once before typechecking a new route.
- Fonts are loaded with `next/font/google`: `Press_Start_2P` for the pixel display face and `JetBrains_Mono` for body text, wired to `--font-press-start` and `--font-jetbrains-mono`.
- UI copy is Spanish and uppercase; route segments are Spanish too. There is no i18n layer — do not add English strings to the interface.

## Testing

`tests/screens.spec.ts` holds the whole suite, grouped by `describe` blocks: reference screenshots, library, detail, player, auth, hall of fame, and responsive.

Two Playwright projects, both on Chromium (`playwright.config.ts`):

| Project | Viewport |
| --- | --- |
| `desktop` | 1440 × 900 |
| `mobile` | emulated iPhone 13 (390 × 844) |

Tests that only make sense on one viewport gate themselves with the `isMobile` fixture — `test.skip(isMobile, "…")` or `test.skip(!isMobile, "…")`. Follow that pattern instead of branching inside a test body.

Reference screenshots live in `tests/screens.spec.ts-snapshots/`, five per project, one per route, named `<route>-<project>-darwin.png`. Rules when a change is visual:

1. Verify the change by hand in a browser first. A screenshot regenerated blind turns a regression into the new baseline.
2. Regenerate only the affected project: `npx playwright test --project=mobile --update-snapshots`.
3. Leaving the other project's screenshots untouched is the evidence that the change did not leak across viewports — that is a feature, not an oversight.

## Spec workflow

Specs live in `specs/NN-slug.md`, numbered sequentially, written in Spanish, with a header carrying state, dependencies, date and a one-sentence objective. States used in this repo: `Borrador`, `Aprobado`, `Implementado`.

- `/spec` writes a new spec after a round of clarifying questions. It never writes code.
- `/spec-impl NN-slug` implements an already-approved spec, step by step, on a `spec-NN-slug` branch.

The skills are vendored in `.agents/skills/spec/` and `.agents/skills/spec-impl/`, with symlinks from `.claude/skills/` so Claude Code picks them up. `specs/.spec-config.yml` holds `AutoCreateBranch`, which controls whether `/spec-impl` creates the branch without asking.

The index of specs and their current states lives in `README.md`. Keep it in sync when a spec's state changes.

## AGENTS.md

`AGENTS.md` is regenerated by `next dev` (see `node_modules/next/dist/server/lib/generate-agent-files.js`), so editing it by hand is pointless — the next dev run rewrites the block and it reappears as an uncommitted change. Its rule stands: this Next.js version departs from training data — consult `node_modules/next/dist/docs/` (`01-app/` for App Router) before writing framework code.
