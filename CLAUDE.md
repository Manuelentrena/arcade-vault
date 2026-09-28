# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Arcade Vault — an arcade gaming platform where players compete for high scores. The seven screens are ported from the HTML/JSX mockups in `references/templates/` (the original five) and `references/templates/home-about/` (the landing and the about page), and are fully navigable: a marketing landing at `/`, the library with search and category filters at `/biblioteca`, game detail with a leaderboard, a CRT player, a sign-in form, a hall of fame, and `/acerca` with a working contact form.

Everything below the UI is real now. The catalog (`public.games`, `public.categorias`) and the leaderboard reads (`public.scores`) come from Supabase since SPEC 16/17, not from mock arrays; SPEC 18 closed the last gap — a played run gets written to `scores` for real, through a `save_score` RPC that only inserts when the result beats the player's own best for that game, so `scores` fills with successive personal records rather than one row per attempt. Until a game's first record gets saved, its leaderboard, its "mejor puntuación" and its slot in the salón's podium still show an explicit empty state — that emptiness is genuine now, not a placeholder waiting on a future spec.

**All four catalog games are real — the five decorative ones from the original mockup are gone (SPEC 17).** They are `TETRIX` (SPEC 13), `ASTEROIDES` (SPEC 14), `ARKANOID` (SPEC 15) and `BUSCAMINAS` (SPEC 20), each a pure rules module in `lib/` (no `document`, no `window`, no canvas) plus a `"use client"` component in `components/` that owns the canvas, the `requestAnimationFrame` loop, the keyboard and the on-screen pad. `components/game-player.tsx` mounts whichever one the `ENGINES` registry maps to `game.id`.

**The games have their own document: [`references/started-games/games.md`](references/started-games/games.md).** Read it before touching a game or the player. It carries the per-engine rules and the deliberate departures from each reference, the `ENGINES`/`EngineProps` contract, the two rules that keep the engines honest (one common HUD, and score saving that only fires on a personal record), the mobile fullscreen toggle (SPEC 19), and what adding a fifth game costs. Three rules from it are load-bearing enough to repeat here: the HUD is common and nothing game-specific goes into it; lives and the level cap come from the `public.games` row (`game.vidas`/`game.niveles`), never from a JS constant; and `increment_game_plays()` counts every attempt while `save_score` only inserts when the run beats the player's own best.

**Captcha on `/auth` (SPEC 09, SPEC 11).** Cloudflare Turnstile sits in the auth card: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, the explicit-render script and the widget lifecycle live in `components/auth-form.tsx`, and the token is passed to `signUp`, `signInWithPassword`, `signInAnonymously` and OAuth. A token is single-use, so it is reset after every attempt. SPEC 11 switched the widget from `interaction-only` to `always` on purpose: an invisible captcha that stops working looks exactly like one that works — an empty gap — and that cost a full day of investigation once.

**Landing, library and contact (SPEC 04, SPEC 05).** `/` is a composed marketing landing (`HomeHero` → `HomeFeatures` → `HomeGames` → `HomeStats` → `HomeActivity` → `HomePricing` → `HomeFinal`); `LibraryBrowser` lives at `/biblioteca`, not at the root. `/acerca` carries `AboutHero` and `ContactSection`, whose form posts to `app/api/contacto/route.ts` — Resend, a `website` honeypot field, and a rate limit of 3 sends per 10 minutes per IP. With `RESEND_API_KEY` empty the route runs in **simulated mode** and sends nothing, which is exactly how the Playwright suite exercises it.

**Reveal-on-scroll.** `components/use-reveal.ts` is a shared client hook that arms the `.reveal` sections of the landing and `/acerca` (`armed` → `in`). It degrades on purpose: with no JavaScript, and under `prefers-reduced-motion`, the content is visible without animation — both fallbacks are pinned by tests, so do not make a section depend on the hook having run.

**Authentication is the exception — it is real.** SPEC 06 replaced the fake session with Supabase Auth: email/password with mandatory email confirmation, Google and GitHub OAuth, a `public.profiles` table under RLS, and cookies refreshed by `proxy.ts`. The session lives in cookies, never in `localStorage`; `lib/session.ts` and the `av_user` key are gone. `/jugar/[id]` is the only protected route. SPEC 07 added guest access on top: `JUGAR COMO INVITADO` calls `signInAnonymously()`, so a guest is a real user with `is_anonymous: true` — same cookie, same proxy, same `profiles` row. The trigger gives them a technical username (`INV70A7E1D`) that is never shown. SPEC 08 added the collection: a daily `pg_cron` job deletes guests inactive for more than 30 days.

The project follows **spec-driven development**. Write a spec before implementing a feature — see the spec workflow section below.

UI work uses the **`/frontend-design`** skill: invoke it before building any new UI or reshaping existing screens, so the visual direction (typography, color, layout) is intentional rather than a templated default.

For deeper UI/UX decisions — design systems, component patterns, accessibility, responsive layout, charts, font pairings, palettes — use the **`/ui-ux-pro-max`** skill. It carries searchable local data (styles, palettes, font pairings, UX guidelines, icons, chart types, stack-specific implementation) and pairs with `/frontend-design`: `/frontend-design` sets the aesthetic direction, `/ui-ux-pro-max` supplies concrete patterns and reviews existing interfaces.

Adding a new catalog game starts with the **`/add-game`** skill: it front-loads the contract the four existing engines already establish (common HUD, `EngineProps`, the `ENGINES` registry, the `games`/`categorias` columns), asks only about what is genuinely undecided for that game, and writes a spec — never code. SPEC 20 came out of it. The contract itself is written down in [`references/started-games/games.md`](references/started-games/games.md).

One step earlier there is the **`game-planner`** subagent (`.agents/agents/game-planner.md`, symlinked from `.claude/agents/`), which answers _which_ game should go in rather than how to build it: it recomputes the catalog's gaps from the migrations (which category is empty, which `color` values are left, whether `jugadores = 2` is still unused), puts every candidate through eight hard gates drawn from the engine contract, and returns a ranked shortlist of three with one recommendation. It writes exactly one file — [`references/started-games/suggestions-games.md`](references/started-games/suggestions-games.md), its memory across runs, where every suggestion is recorded with its verdict, rejections included — and never a spec and never code. The chain is **`game-planner` → `/add-game` → `/spec-impl`**.

## Commands

```bash
npm run dev          # next dev — also regenerates the nextjs-agent-rules block in AGENTS.md
npm run build        # next build
npm run start        # next start (requires a prior build)
npm run lint         # eslint (flat config; no --dir arg, lints the whole project)
npm test             # playwright test — both projects (pretest resets the local DB)
npm run test:update  # playwright test --update-snapshots
npx tsc --noEmit     # typecheck; no npm script exists for this

npx supabase start   # local stack in Docker (Postgres, Auth, Studio, Mailpit)
npx supabase stop    # tear it down
npx supabase db reset # replay migrations + seed.sql
npx supabase status  # API URL, publishable key, Mailpit URL
npx supabase functions serve --env-file supabase/functions/.env   # Edge Functions en local
```

`npm test` requires the local Supabase stack to be running: its `pretest` runs `npx supabase db reset` and then waits for Auth to answer. Without Docker up it fails there.

Playwright is the only test runner here, and there are no unit tests — everything is end-to-end in `tests/screens.spec.ts`. Its `webServer` runs `npm run build` and then `next start -p 3100`, so `npm test` compiles a production build first and is slow. Expect minutes, not seconds.

## Architecture

Routes (App Router, URLs deliberately in Spanish):

| Route            | File                                 | Notes                                                                                                                               |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/`              | `app/page.tsx`                       | Landing (`HomeHero` … `HomeFinal`); `getGames()` only to feed `HomeGames`                                                           |
| `/biblioteca`    | `app/biblioteca/page.tsx`            | The real home of `LibraryBrowser`; `getGames()` + `getCategorias()`                                                                 |
| `/acerca`        | `app/acerca/page.tsx`                | `AboutHero`, `AboutDivider`, `ContactSection`                                                                                       |
| `/juego/[id]`    | `app/juego/[id]/page.tsx`            | Async page; `notFound()` when `getGameBySlug(id)` misses                                                                            |
| `/jugar/[id]`    | `app/jugar/[id]/page.tsx`            | Async page; same `notFound()` guard; validates `?puntuacion=&nivel=`                                                                |
| `/auth`          | `app/auth/page.tsx`                  | Thin wrapper over `AuthForm`                                                                                                        |
| `/auth/callback` | `app/auth/callback/route.ts`         | OAuth return; `exchangeCodeForSession`                                                                                              |
| `/auth/confirm`  | `app/auth/confirm/route.ts`          | Email-confirmation link; `verifyOtp`                                                                                                |
| `/salon`         | `app/salon/page.tsx`                 | Resolves `getGames()`, the session, and per-game `getLeaderboard(slug, 12)` + `getUserBestScore()`, then hands rows to `HallOfFame` |
| `/api/contacto`  | `app/api/contacto/route.ts`          | POST only; Resend, honeypot, 3 sends per 10 min per IP, simulated without a key                                                     |
| —                | `app/not-found.tsx`, `app/error.tsx` | 404 screen and error boundary (`error.tsx` is a client component)                                                                   |
| —                | `proxy.ts` (repo root)               | Refreshes the token on every request and guards `/jugar/[id]`                                                                       |

The route files under `app/` stay thin: they resolve params, fetch from `lib/`, and delegate to a component. Put behavior in `components/`, not in the page.

`components/` holds 28 components plus one shared hook, spread over the root and two subdirectories — `components/home/` (10 files for the landing) and `components/about/` (5 for `/acerca`). Thirteen carry `"use client"` because they hold state or DOM handlers: `nav.tsx`, `session-provider.tsx`, `library-browser.tsx`, `game-card.tsx`, `game-player.tsx`, `tetris-game.tsx`, `asteroids-game.tsx`, `arkanoid-game.tsx`, `buscaminas-game.tsx`, `auth-form.tsx`, `hall-of-fame.tsx`, `about/contact-form.tsx` and `home/home-hero.tsx`, plus the `use-reveal.ts` hook they share. The other fifteen are server components and should stay that way — `footer.tsx`, `leaderboard.tsx` (it renders rows it receives as props) and nearly all of `home/` and `about/`, which are presentational. When adding to either subdirectory, the default is a server component: reach for `"use client"` only when something actually needs the browser.

`lib/tetris.ts`, `lib/asteroids.ts`, `lib/arkanoid.ts` and `lib/buscaminas.ts` are the pure rules engines — no mock data, no Supabase, no DOM; their rules are documented in [`references/started-games/games.md`](references/started-games/games.md). Everything else that used to be mock data now lives in `lib/supabase/`, which talks to the real schema:

- `client.ts` — `createClient()` for the browser (`createBrowserClient`).
- `server.ts` — `createClient()` for server components and route handlers, over `await cookies()`. Never share one across requests.
- `session.ts` — `getServerSession()`, which verifies the JWT with `getClaims()` and then reads `profiles.username`. It re-exports `SessionUser` but does not own it.
- `user.ts` — owns `SessionUser` (`id`, `name`, `email: string | null`, `isGuest: boolean`) and `displayName(user)`, the only sanctioned way to paint a name.
- `games.ts` — `Game`, `GameColor`, `GameCat`, `CatFilter`, `Categoria`; `getGames()`, `getGameBySlug(slug)`, `getCategorias()` (SPEC 16, SPEC 17). `Game.id` is the row's `slug`, not its internal `uuid` — every component that already used `game.id` as the route segment or the `ENGINES` key kept working unchanged. Cosmetic fields (`color`, `cover`, `image`, `short`, `long`) plus `dificultad`, `jugadores` and `perifericos` live on `public.games`, seeded alongside the rest in the migration; all four rows have an `image`, because all four exist to be photographed. `BUSCAMINAS` arrived in `supabase/migrations/20260928094713_catalogo_buscaminas.sql` — a single additive `insert`, no schema change: `niveles: null`, `vidas: 1`, the `PUZZLE` category, `dificultad: 2`, `jugadores: 1`, `perifericos: ['teclado', 'raton']`.
- `scores.ts` — `ScoreRow`; `getLeaderboard(gameId, limit)`, `getBestScores()`, `getUserBestScore(gameId, userId)` (SPEC 16, SPEC 17). Every function takes a game's `slug` and resolves it to `scores.game_id`'s `uuid` internally — callers never see the uuid.
- `types.ts` — generated with `npx supabase gen types typescript`. It is committed; regenerate it whenever the schema changes.

**Session rule:** components read session state through `useSession()` from `components/session-provider.tsx`; server code uses `getServerSession()`. `app/layout.tsx` resolves the session once and hands it to the provider as `initialUser`, so the first HTML already carries the name — which is also why all seven page routes (`/`, `/biblioteca`, `/acerca`, `/juego/[id]`, `/jugar/[id]`, `/auth`, `/salon`) are dynamic. Never talk to Supabase auth directly from a component that only needs to know who is signed in, and never reintroduce a second source of truth in `localStorage`. The name you paint comes from `displayName(user)` in `lib/supabase/user.ts`, never from `user.name` directly — that is what keeps a guest's technical username off the screen.

**Schema changes** go in a migration under `supabase/migrations/`, never as an ad-hoc statement against the database: `npx supabase db reset` replays them locally and is what `pretest` runs.

**Guest purge (SPEC 08).** A daily `pg_cron` job, `purga-invitados` at `0 4 * * *` (UTC — `cron.timezone` is GMT), deletes anonymous users inactive for more than 30 days. The chain is `purge_guests_tick()` → `pg_net` POST → Edge Function `supabase/functions/borrar-invitados` → `stale_guest_ids()` → `auth.admin.deleteUser()`. Four rules hold it together:

- **Never delete from `auth.users` in SQL.** It skips the cascades and GoTrue's internal state (identities, sessions, refresh tokens). Deletion goes through the Admin API, which is why an Edge Function exists at all.
- **Postgres filters, the function orchestrates.** The `is_anonymous` + age filter lives in `stale_guest_ids()`; do not move it to TypeScript, and do not send uuids in the POST body.
- **Both functions are `security definer` in `public`, so PostgREST publishes them.** Each one carries a `revoke execute … from public, anon, authenticated`. Any new function in that family needs the same revoke, or the publishable key — which ships in the browser bundle — can fire it.
- **The Vault secrets guard is load-bearing.** `purge_guests_tick()` returns early when `guest_purge_url` or `guest_purge_key` is missing. `db reset` wipes the Vault, so the job stays mute during `npm test` and fires no HTTP. Do not replace that guard with a default URL.

`public.guest_cleanup_runs` is the only record of a run — `pg_net` is fire-and-forget and `cron.job_run_details` only knows the SQL returned. RLS on, no policies: the service key writes it, nobody reads it over the API. The secrets are created by hand per environment (`README.md`, «Purga automática de invitados»); `PURGE_SECRET` is a random bearer, never a service key, and never enters a versioned file.

## Stack and conventions

- **Next.js 16.3.5 App Router**, React 19.2.8, TypeScript strict mode. Everything lives under `app/`, `components/` and `lib/`; there is no `src/` directory and no Pages Router.
- The App Router pins its own React canary internally — the `react` version in `package.json` governs only Pages Router code, which this project does not use.
- **Styling is two layers that coexist.** `app/globals.css` holds a hand-written arcade theme of roughly 3,400 lines: `:root` design tokens, an `@theme inline` block, and semantic classes (`.av-*`, `.cover-*`, `.btn`, `.chip`, `.card`, `.field`). On top of that, JSX uses Tailwind v4 utilities for incidental layout (see `app/not-found.tsx`). Screen-level CSS stays in `globals.css` under its existing class names — do not convert it to utility soup, and do not fork a second theme into a component file.
- **Tailwind CSS v4** via `@tailwindcss/postcss`. There is no `tailwind.config.*`; configuration is CSS-first inside `app/globals.css` using `@import "tailwindcss"` and the `@theme inline` block. Add design tokens there as CSS custom properties on `:root` and expose them to utilities via `@theme inline`. The app is dark-only by design.
- Import alias `@/*` maps to the repo root (`tsconfig.json` paths), so `@/components/...`, `@/lib/...`.
- Layouts/pages receive typed props from Next-generated globals such as `LayoutProps<"/">` and `PageProps<"/juego/[id]">` (see `app/layout.tsx` and the dynamic routes) — these come from `.next/types`, so run `next dev` or `next build` at least once before typechecking a new route.
- Fonts are loaded with `next/font/google`: `Press_Start_2P` for the pixel display face and `JetBrains_Mono` for body text, wired to `--font-press-start` and `--font-jetbrains-mono`.
- UI copy is Spanish and uppercase; route segments are Spanish too. There is no i18n layer — do not add English strings to the interface.

## Testing

`tests/screens.spec.ts` holds the whole suite — 1,477 lines, 17 top-level `describe` blocks, in file order: `capturas de referencia`, `home`, `home sin animación de entrada` (with `sin JavaScript` and `con prefers-reduced-motion` nested inside), `biblioteca`, `detalle`, `reproductor`, `fin de partida como invitado`, `tetrix`, `asteroides`, `arkanoid`, `buscaminas`, `auth`, `registro por correo`, `salón de la fama`, `acerca`, `endpoint de contacto`, `responsive`. The four engine blocks do not freeze the clock — their loops need a live `requestAnimationFrame` — and none asserts anything that depends on the randomness of a run.

Two Playwright projects, both on Chromium (`playwright.config.ts`):

| Project   | Viewport                       |
| --------- | ------------------------------ |
| `desktop` | 1440 × 900                     |
| `mobile`  | emulated iPhone 13 (390 × 844) |

The suite runs with `workers: 2`. Every navigation now goes through the Docker stack — the proxy validates the token, the layout resolves the session — and with one worker per core Auth exhausts its DB pool and requests start dying with 504s while nothing is actually broken. `playwright.config.ts` also pins the local `NEXT_PUBLIC_SUPABASE_*` values in the `webServer` `env`: they are inlined into the `next build` that `webServer` runs, so without them the suite would compile against the remote project and create real users. It pins `RESEND_API_KEY: ""` for the same reason — `/api/contacto` then runs in simulated mode and the suite sends no mail.

Tests that touch `/auth` call `authReady(page)` first. The server already ships the `<form>`, so a click that lands before hydration triggers a native submit and is silently lost.

Four helpers carry weight and are worth knowing before writing a test: `disarmReveal(page)` turns the reveal animations off so a screenshot of the landing or `/acerca` is deterministic; `freshIp()` hands each contact-form send a different `x-forwarded-for` so the route's rate limit does not fail the suite; `confirmationLink()` reads the email out of Mailpit to finish a real sign-up; and `NAV_TIMEOUT` is the shared navigation budget.

Tests that only make sense on one viewport gate themselves with the `isMobile` fixture — `test.skip(isMobile, "…")` or `test.skip(!isMobile, "…")`. Follow that pattern instead of branching inside a test body.

Reference screenshots live in `tests/screens.spec.ts-snapshots/`, seven per project and fourteen in total, one per route — `home`, `biblioteca`, `detalle`, `reproductor`, `auth`, `salon`, `acerca` — named `<route>-<project>-darwin.png`. Rules when a change is visual:

1. Verify the change by hand in a browser first. A screenshot regenerated blind turns a regression into the new baseline.
2. Regenerate only the affected project: `npx playwright test --project=mobile --update-snapshots`.
3. Leaving the other project's screenshots untouched is the evidence that the change did not leak across viewports — that is a feature, not an oversight.

## Deployment

Two environments and no third: **local** (Docker stack, `npm run dev`, `npm test`) and **production** — Vercel, deployed from `main` only, against the one remote Supabase project. There are no branch previews and no staging, so a `spec-NN-slug` branch produces no deployment: its review is local, plus the CI workflow in `.github/workflows/ci.yml` (`npm ci` → `npm run build` → `npx tsc --noEmit` → `npm run lint`, in that order — `tsc` needs the route types Next writes to `.next/types`). CI carries no GitHub secret; it builds against the same local-stack demo keys `playwright.config.ts` uses.

**Database first, code second.** When a spec brings migrations or Edge Functions, they go to the remote project with `npx supabase db push` / `functions deploy` **before** the merge to `main`, never after — otherwise new code hits an old schema in production. Because there is only one remote, the window between that push and the merge runs the **old** code against the **new** schema, so **every migration must be backward compatible**: add tables, columns or functions; never rename or drop what live code still uses. Removing something is a later spec. Vercel's _Instant Rollback_ returns the code, not the schema — which is why the rule exists. The full per-spec checklist lives in `README.md`, «Despliegue».

## Spec workflow

Specs live in `specs/NN-slug.md`, numbered sequentially, written in Spanish, with a header carrying state, dependencies, date and a one-sentence objective. States used in this repo: `Borrador`, `Aprobado`, `Implementado`.

- `/spec` writes a new spec after a round of clarifying questions. It never writes code.
- `/spec-impl NN-slug` implements an already-approved spec, step by step, on a `spec-NN-slug` branch.

The skills are vendored in `.agents/skills/spec/`, `.agents/skills/spec-impl/` and `.agents/skills/add-game/`, with symlinks from `.claude/skills/` so Claude Code picks them up; the `game-planner` subagent follows the same pattern from `.agents/agents/`, with `.claude/agents/game-planner.md` as a symlink to the vendored file. A new agent only appears in the registry after restarting the session — it is read at startup, not on demand. `specs/.spec-config.yml` holds `AutoCreateBranch`, which controls whether `/spec-impl` creates the branch without asking.

The index of specs and their current states lives in `README.md`. Keep it in sync when a spec's state changes.

## AGENTS.md

`AGENTS.md` is regenerated by `next dev` (see `node_modules/next/dist/server/lib/generate-agent-files.js`), so editing it by hand is pointless — the next dev run rewrites the block and it reappears as an uncommitted change. Its rule stands: this Next.js version departs from training data — consult `node_modules/next/dist/docs/` (`01-app/` for App Router) before writing framework code.
