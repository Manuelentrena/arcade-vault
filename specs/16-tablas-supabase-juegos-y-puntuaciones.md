# SPEC 16 — Tablas Supabase para catálogo de juegos y puntuaciones

**Estado:** Implementada
**Depende de:** SPEC 06 (Supabase Auth real), SPEC 13 (TETRIX), SPEC 14 (ASTEROIDES), SPEC 15 (ARKANOID)
**Fecha:** 2026-09-27
**Objetivo:** Crear en Supabase las tablas `games` (catálogo, sembrada con los 3 juegos reales) y `scores` (esquema vacío) que sostendrán la biblioteca y el guardado de partidas en specs futuras, sin tocar código de aplicación.

## Alcance

**Dentro:**

- Migración que crea `public.games`: catálogo de los 3 juegos reales (TETRIX, ASTEROIDES, ARKANOID), sembrada con sus datos jugables.
- Migración que crea `public.scores`: esquema para el historial de partidas, vacía.
- Políticas RLS de ambas tablas.
- Regenerar `lib/supabase/types.ts` tras aplicar la migración en local.

**Fuera de alcance (explícito):**

- Eliminar del código los 5 juegos decorativos (SERPENTINA, GLOTÓN, INVASORES, RANARIA, DUELO PIXEL): entradas en `lib/games.ts`, CSS muerto en `globals.css`, el ticker de `home-activity.tsx`, y los tests de `tests/screens.spec.ts` que dependen de ellos. Va en una spec aparte, posterior a esta.
- Reescribir `library-browser.tsx`, `game-card.tsx`, `app/juego/[id]/page.tsx`, `app/jugar/[id]/page.tsx` y `hall-of-fame.tsx` para leer `games`/`scores` desde Supabase en vez de `lib/games.ts`/`lib/scores.ts`. Va en la misma spec futura anterior (depende de esta).
- Cualquier ruta de escritura real de puntuaciones: el botón "GUARDAR PUNTUACIÓN" en `game-player.tsx` sigue siendo decorativo. Es una spec futura, distinta de la anterior.
- Cambiar el "mejor puntuación" mostrado en la biblioteca — sigue siendo el mock estático de `lib/games.ts` hasta que exista guardado real y se calcule con `MAX(score)`.
- Sembrar `scores` con datos.

## Modelo de datos

Un único archivo de migración (mismo patrón que SPEC 08, que agrupó varias tablas/funciones en un solo archivo):

`supabase/migrations/<timestamp>_catalogo_juegos_y_puntuaciones.sql`

```sql
-- games: catálogo de los juegos reales del arcade (ver CLAUDE.md — solo
-- TETRIX, ASTEROIDES y ARKANOID tienen motor jugable propio).
create table public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug = lower(slug)),
  nombre text not null,
  niveles integer
    check (niveles is null or niveles > 0),
  vidas integer not null
    check (vidas > 0),
  created_at timestamptz not null default now()
);

alter table public.games enable row level security;

create policy "catalogo de juegos visible para todos"
  on public.games for select using (true);
-- Sin insert/update/delete: el catálogo lo mantiene esta migración, no la API pública.

insert into public.games (slug, nombre, niveles, vidas) values
  ('tetrix', 'TETRIX', 10, 1),
  ('asteroides', 'ASTEROIDES', null, 1),
  ('arkanoid', 'ARKANOID', null, 3);

-- scores: historial de partidas jugadas. Esquema listo, sin datos:
-- el guardado real de una partida es una spec futura.
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id),
  score integer not null check (score >= 0),
  level integer not null default 1 check (level >= 1),
  created_at timestamptz not null default now()
);

alter table public.scores enable row level security;

create policy "puntuaciones visibles para todos"
  on public.scores for select using (true);

create policy "cada cual guarda su propia partida"
  on public.scores for insert with check (auth.uid() = user_id);
-- Sin update/delete: una puntuación guardada es un hecho histórico inmutable.

create index scores_game_id_score_idx on public.scores (game_id, score desc);
create index scores_user_id_idx on public.scores (user_id);
```

`niveles` es `NULL` cuando el juego no tiene tope de nivel (ASTEROIDES, ARKANOID son infinitos por diseño). `vidas` son las vidas iniciales con las que arranca una partida. `game_id` referencia el `id` uuid interno de `games`, no el `slug`, para que un futuro cambio de slug no rompa puntuaciones ya guardadas. `scores` no lleva `update`/`delete` porque una partida jugada es un hecho inmutable; los índices sirven para las consultas de leaderboard por juego (`game_id, score desc`) y de historial por jugador (`user_id`) que alimentarán la spec de guardado real.

## Plan de implementación

1. Crear `supabase/migrations/<timestamp>_catalogo_juegos_y_puntuaciones.sql` con el SQL anterior (timestamp posterior a `20260922142805`, generado al implementar).
2. `npx supabase db reset` en local para aplicar la migración y confirmar que no rompe el arranque de Auth que usa `pretest`.
3. Regenerar `lib/supabase/types.ts` (`npx supabase gen types typescript --local`) para que `games` y `scores` aparezcan en `Database["public"]["Tables"]`, y commitear el archivo.
4. Antes de mergear a `main`: `npx supabase db push` contra el proyecto remoto (regla "la base de datos primero, el código después" del README) — el código de aplicación no cambia en esta spec, así que no hay ventana de incompatibilidad.

## Criterios de aceptación

- [ ] La migración existe en `supabase/migrations/` con timestamp posterior al último existente.
- [ ] `npx supabase db reset` aplica la migración sin error.
- [ ] `select * from games order by slug` devuelve exactamente 3 filas: `arkanoid` (niveles NULL, vidas 3), `asteroides` (niveles NULL, vidas 1), `tetrix` (niveles 10, vidas 1).
- [ ] `select count(*) from scores` devuelve 0.
- [ ] Con la clave anónima (`anon`), `select` funciona en ambas tablas sin sesión.
- [ ] Con la clave anónima y sin sesión, un `insert` en `scores` falla; autenticado y con `user_id` igual al propio `auth.uid()`, el `insert` funciona.
- [ ] `lib/supabase/types.ts` incluye `games` y `scores` con sus columnas.
- [ ] `npm run build`, `npx tsc --noEmit`, `npm run lint` y `npm test` (suite completa) siguen pasando sin ningún cambio en `lib/games.ts`, `lib/scores.ts` ni en componentes/páginas existentes.

## Decisiones tomadas y descartadas

- **Dos specs en vez de una.** Migrar y reescribir la UI en el mismo cambio mezclaría "base de datos primero" con un refactor de frontend; se separan para poder desplegar la migración de forma independiente. Decisión explícita del usuario.
- **`id` uuid + `slug` text separados**, en vez de usar el slug como clave primaria. Permite que un futuro cambio de ruta/slug no invalide claves foráneas ya creadas. Decisión explícita del usuario, revirtiendo una primera propuesta de "slug como PK".
- **FK de `scores` a `games.id` (uuid), no a `games.slug`.** Estándar: aísla el historial de puntuaciones de cambios de slug.
- **Sin `mejor_puntuacion` en `games`.** Es un valor derivado (`MAX(score)` sobre `scores`), no un hecho fijo del juego; guardarlo como columna lo desincronizaría en cuanto existiera guardado real. El mock (`best`) de `lib/games.ts` se mantiene hasta que exista esa spec de guardado. Decisión explícita del usuario.
- **Sin campos visuales en `games`** (color, cover, image, textos, contador de partidas). Son branding estático de frontend, no datos de juego; se quedan en `lib/games.ts`. Decisión explícita del usuario.
- **Sin columna `ruta`.** Siempre se deriva como `'/juego/' + slug` y `'/jugar/' + slug`; no existe ninguna excepción ni `generateStaticParams` que la necesite como dato.
- **`niveles` nullable con `NULL` = infinito**, en vez de un valor centinela (`-1`). Evita inventar una convención que cualquier lector futuro tendría que conocer.
- **Nombres de tabla en inglés** (`games`, `scores`), igual que `profiles` y `guest_cleanup_runs` ya existentes, aunque la spec y la UI estén en español.
- **RLS de `scores` abierta en lectura, cerrada a inserción propia** — igual que `profiles`, porque estas tablas alimentarán un leaderboard público real en una spec futura, a diferencia de `guest_cleanup_runs` (log interno solo para `service_role`).
- **`scores` no se siembra.** Decisión explícita del usuario: la migración no inserta puntuaciones falsas.
- **`games` sí se siembra con las 3 filas reales, dentro de la propia migración.** Es dato de catálogo (como cualquier tabla de referencia), no dato generado por un usuario; decisión explícita del usuario.

## Riesgos identificados

- La spec futura que reconecte la UI deberá resolver `slug` (el id de ruta actual, ej. `"tetrix"`) contra `games.id` (uuid) antes de poder insertar o filtrar en `scores` — quedará anotado como dependencia de esa spec.
- Ninguna consulta de leaderboard real tendrá filas hasta que exista la spec de guardado; cualquier vista que se construya sobre `scores` debe contemplar el caso "0 filas" desde el primer día.
