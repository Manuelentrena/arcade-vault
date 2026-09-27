# SPEC 17 — Catálogo real desde Supabase y borrado de los juegos decorativos

**Estado:** Implementado
**Depende de:** SPEC 16 (tablas `games` y `scores`), SPEC 06 (Supabase Auth real), SPEC 13/14/15 (motores reales)
**Fecha:** 2026-09-27
**Objetivo:** Reducir el catálogo a los 3 juegos reales leídos desde Supabase (con su ficha, categoría, dificultad y contador de partidas reales), mostrar puntuaciones reales aunque estén vacías, y borrar del código todo lo que pertenecía a los 5 juegos decorativos.

## Alcance

**Dentro:**

- Nueva migración que añade a `games` las columnas cosméticas y de ficha que hoy son mock en `lib/games.ts` (`color`, `cover`, `image`, `short`, `long`, `dificultad`, `jugadores`, `perifericos`), más un contador real `plays`, más `categoria_id` referenciando una tabla nueva `categorias`. Sembrado con los datos reales de los 3 juegos.
- Función Postgres `increment_game_plays(p_slug)` para sumar una partida jugada, llamada desde el cliente al empezar una partida.
- `lib/supabase/games.ts` (tipos + `getGames()`, `getGameBySlug()`, `getCategorias()`) y `lib/supabase/scores.ts` (tipo `ScoreRow` + `getLeaderboard()`, `getBestScores()`, `getUserBestScore()`), sustituyendo a `lib/games.ts` y `lib/scores.ts`, que se borran enteros.
- `/biblioteca` lee sus 3 juegos y sus categorías de Supabase; los chips de filtro (`TODOS`/`ARCADE`/`PUZZLE`/`SHOOTER`/`VERSUS`) salen de la tabla `categorias`, no de un array fijo.
- La home (`/`), la ficha (`/juego/[id]`) y el salón (`/salon`) leen el mismo catálogo real; la ficha pinta dificultad, nº de jugadores y periféricos reales en vez de las etiquetas fijas que hoy tiene (`1 JUGADOR`, `TECLADO / TÁCTIL`, las estrellas de dificultad).
- Puntuaciones reales: "mejor puntuación" (card, ficha) y la tabla de puntuaciones (ficha, salón) leen de `scores` de verdad. Como la tabla está vacía, se muestran estados vacíos explícitos en vez de datos inventados.
- Borrado completo de los 5 juegos decorativos (SERPENTINA, GLOTÓN, INVASORES, RANARIA, DUELO PIXEL) del código: entradas de catálogo, CSS muerto, menciones en el ticker de la home, y los tests que dependían de ellos.
- Borrado de la rama decorativa muerta en `game-player.tsx` (el temporizador que subía la puntuación sola y la "arena" CSS de relleno), porque los 3 juegos que quedan siempre tienen motor real y esa rama deja de ser alcanzable.

**Fuera de alcance (explícito):**

- Guardado real de una partida jugada: el botón "GUARDAR PUNTUACIÓN" sigue siendo decorativo. Es una spec futura.
- Que las vidas/niveles del motor de cada juego (`ENGINES` en `game-player.tsx`) se lean de las columnas `vidas`/`niveles` de `games` en vez de sus constantes de JS actuales. Se queda como está.
- Pintar el tag decorativo "RETRO 1985" con un dato real — sigue siendo texto fijo, no se pidió campo para él.
- Cualquier gestión de categorías desde una UI de administración — la tabla `categorias` se siembra en la migración, no hay pantalla para editarla.

## Modelo de datos

Migración nueva (`supabase/migrations/<timestamp>_catalogo_categorias_y_plays.sql`), que **añade** sobre la tabla `games` ya existente (spec 16) sin tocar la migración `20260927082152` ya aplicada en remoto:

```sql
-- categorias: entidad propia en vez de un enum embebido en games.
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

alter table public.categorias enable row level security;

create policy "categorias visibles para todas"
  on public.categorias for select using (true);
-- Sin insert/update/delete: el catálogo de categorías lo mantiene esta migración.

insert into public.categorias (nombre) values
  ('ARCADE'),
  ('PUZZLE'),
  ('SHOOTER'),
  ('VERSUS');

-- games: datos cosméticos y de ficha que antes vivían como mock en
-- lib/games.ts, más el contador real de partidas jugadas.
alter table public.games
  add column categoria_id uuid references public.categorias (id),
  add column color text
    check (color in ('cyan', 'magenta', 'yellow', 'green')),
  add column cover text,
  add column image text,
  add column short text,
  add column long text,
  add column plays integer not null default 0
    check (plays >= 0),
  add column dificultad integer
    check (dificultad between 1 and 5),
  add column jugadores integer
    check (jugadores in (1, 2)),
  add column perifericos text[]
    check (
      perifericos <@ array['teclado', 'raton']::text[]
      and array_length(perifericos, 1) > 0
    );

update public.games set
  categoria_id = (select id from public.categorias where nombre = 'PUZZLE'),
  color = 'magenta',
  cover = 'cover-tetro',
  image = '/juegos/tetrix.png',
  short = 'Encaja los tetrominós y limpia líneas sin llegar al techo.',
  long = 'Siete piezas de neón caen sobre una rejilla de 10 × 20. Rótalas, deslízalas y encájalas para limpiar líneas: cada diez líneas sube el nivel y las piezas caen más rápido, hasta el nivel 10. Una sola vida: si el montón llega al techo, la partida termina y empiezas de nuevo.',
  dificultad = 4,
  jugadores = 1,
  perifericos = array['teclado']
where slug = 'tetrix';

update public.games set
  categoria_id = (select id from public.categorias where nombre = 'SHOOTER'),
  color = 'yellow',
  cover = 'cover-rocas',
  image = '/juegos/asteroides.png',
  short = 'Pulveriza rocas a la deriva y recoge lo que sueltan.',
  long = 'Tu nave flota en gravedad cero: gira, empuja y dispara para partir cada roca en fragmentos más pequeños y rápidos. Al romperlas caen objetos — disparo triple y escudo — que duran unos segundos. Una sola vida: el primer impacto termina la partida.',
  dificultad = 5,
  jugadores = 1,
  perifericos = array['teclado']
where slug = 'asteroides';

update public.games set
  categoria_id = (select id from public.categorias where nombre = 'ARCADE'),
  color = 'cyan',
  cover = 'cover-bricks',
  image = '/juegos/arkanoid.png',
  short = 'Rompe el muro sin dejar caer la bola.',
  long = 'Una bola de neón rebota entre las paredes de la pantalla y tú sólo controlas la pala. Rompe todos los ladrillos para pasar de nivel: el muro cambia en cada uno y la bola va cada vez más rápida, sin final. Golpea con el borde de la pala para desviarla y apuntar. Tres vidas; cuando cae la última bola, se acabó.',
  dificultad = 3,
  jugadores = 1,
  perifericos = array['teclado', 'raton']
where slug = 'arkanoid';

alter table public.games
  alter column categoria_id set not null,
  alter column color set not null,
  alter column short set not null,
  alter column long set not null,
  alter column dificultad set not null,
  alter column jugadores set not null,
  alter column perifericos set not null;

-- increment_game_plays: contador real de partidas empezadas. security definer
-- para no abrir un UPDATE público sobre toda la tabla games; se concede a
-- anon y authenticated porque cualquier visitante, incluido un invitado,
-- puede empezar una partida.
create or replace function public.increment_game_plays(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.games set plays = plays + 1 where slug = p_slug;
end;
$$;

revoke execute on function public.increment_game_plays(text) from public;
grant execute on function public.increment_game_plays(text) to anon, authenticated;
```

`cover`/`image` se quedan nullable (todo juego real ya tiene `image`, `cover` es el respaldo CSS heredado). `perifericos` solo admite los átomos `teclado`/`raton`; ARKANOID escucha `onPointerMove` para apuntar la pala (además del teclado), TETRIX y ASTEROIDES solo teclado — la ficha combina el array en texto ("SOLO TECLADO" / "TECLADO / RATÓN"), eso es presentación, no dato guardado. `plays` se siembra en `0`: es coherente con `scores` vacía, nadie ha jugado todavía a través del contador real.

**Módulos de lectura** (sustituyen a `lib/games.ts` y `lib/scores.ts`, que se borran):

- `lib/supabase/games.ts`: tipos `Game` (con `id` = el `slug`, para no tocar los componentes que ya usan `game.id` como segmento de ruta), `GameColor`, `GameCat`, `CatFilter`; `getGames()` (join con `categorias` y con el `MAX(score)` agregado de `scores`, para `best`), `getGameBySlug(slug)`, `getCategorias()`.
- `lib/supabase/scores.ts`: tipo `ScoreRow`; `getLeaderboard(gameId, limit)`, `getBestScores()` (mapa `game_id → mejor puntuación`), `getUserBestScore(gameId, userId)` (para "TU MEJOR MARCA" en el salón).

## Plan de implementación

1. Migración `supabase/migrations/<timestamp>_catalogo_categorias_y_plays.sql` con el SQL anterior. `db reset` local, verificar los 3 juegos con sus columnas nuevas, `categorias` con 4 filas, y la función `increment_game_plays` (llamarla a mano y comprobar que `plays` sube).
2. Crear `lib/supabase/games.ts` y `lib/supabase/scores.ts`. Borrar `lib/games.ts` y `lib/scores.ts`.
3. Actualizar los imports de tipos en `components/game-card.tsx`, `components/home/mini-card.tsx`, `components/home/home-games.tsx`, `components/home/home-features.tsx`, `components/leaderboard.tsx` a la nueva ubicación.
4. `app/biblioteca/page.tsx` pasa a ser async: `getGames()` + `getCategorias()`, se los pasa como props a `LibraryBrowser`. `components/library-browser.tsx` recibe esos props en vez de importar `GAMES`/`CATS`; el chip "TODOS" se sigue añadiendo en el cliente.
5. `app/page.tsx` (home): `getGames()` en vez de importar `GAMES`, se lo pasa a `HomeGames`.
6. `app/juego/[id]/page.tsx`: `getGameBySlug(id)` en vez de `getGame(id)`; `getLeaderboard(id, 10)` en vez de `seededScores`. La ficha pinta `game.dificultad` (estrellas), `game.jugadores` ("1 JUGADOR"/"2 JUGADORES") y `game.perifericos` combinado, sustituyendo las tres etiquetas fijas actuales. "Mejor global" muestra "—" si `best` es `null`. `components/leaderboard.tsx` pinta "AÚN NADIE HA JUGADO" cuando `rows` está vacío, en vez de una tabla en blanco.
7. `app/jugar/[id]/page.tsx`: `getGameBySlug(id)` en vez de `getGame(id)`.
8. `app/salon/page.tsx`: obtiene `getGames()`, `getLeaderboard()` por cada juego y (si hay sesión) `getUserBestScore()` por juego; se lo pasa todo a `HallOfFame`. `components/hall-of-fame.tsx` deja de usar `seededScores`/`hallSeed`/la fórmula falsa de "tu mejor marca": sin filas no pinta podio y muestra "AÚN NADIE HA JUGADO"; "TU MEJOR MARCA" muestra "AÚN NO HAS JUGADO" si el usuario no tiene puntuación en ese juego.
9. `components/game-player.tsx`: borra la rama `!engine` (constante `NEW_RUN`, el `setInterval` de `TICK_MS`, el JSX de la arena decorativa) y llama a `supabase.rpc("increment_game_plays", { p_slug: game.id })` al montar el reproductor.
10. `components/home/home-activity.tsx`: sus menciones de juegos pasan a repartirse entre TETRIX/ASTEROIDES/ARKANOID.
11. `app/globals.css`: borra `.cover-snake`, `.cover-glot`, `.cover-invaders`, `.cover-rana`, `.cover-duelo`.
12. `tests/screens.spec.ts`: quita/reescribe los tests que dependían de los 5 juegos borrados (rutas `/juego/serpentina`, `/jugar/serpentina`, el filtro que esperaba "INVASORES", el tab "SERPENTINA" del salón) y el test de la rama decorativa ("la puntuación sube sola y se congela al pausar"); ajusta los conteos fijos (biblioteca: 8 → 3 juegos; salón: 8 → 3 chips de juego).
13. Regenerar `lib/supabase/types.ts`.
14. `npx supabase db push` a remoto antes de mergear a `main` (regla "la base de datos primero").

## Criterios de aceptación

- [ ] `lib/games.ts` y `lib/scores.ts` no existen.
- [ ] Ninguna referencia a `serpentina`, `gloton`, `invasores`, `ranaria` o `duelo-pixel` queda en `app/`, `components/`, `tests/` ni `app/globals.css`.
- [ ] `/biblioteca` muestra exactamente 3 juegos, leídos de Supabase; los chips de categoría vienen de `categorias` (incluye VERSUS aunque no filtre ningún juego).
- [ ] La ficha de cada uno de los 3 juegos pinta dificultad (estrellas), nº de jugadores y periféricos reales, no las etiquetas fijas de antes.
- [ ] Con `scores` vacía: "mejor puntuación" muestra "—" en card y ficha; la tabla de puntuaciones (ficha y salón) muestra "AÚN NADIE HA JUGADO"; el salón no pinta podio; "TU MEJOR MARCA" (con sesión) muestra "AÚN NO HAS JUGADO".
- [ ] Entrar a jugar cualquiera de los 3 juegos incrementa su `plays` real en la base de datos (verificable con una consulta directa antes/después).
- [ ] `game-player.tsx` no contiene la rama `!engine` ni el temporizador decorativo.
- [ ] `npm run build`, `npx tsc --noEmit`, `npm run lint` y `npm test` pasan.

## Decisiones tomadas y descartadas

- **Los campos cosméticos (color, cover, imagen, textos) SÍ van en `games`**, revirtiendo la decisión de la spec 16 de dejarlos en código. Decisión explícita del usuario: si van a leerse de Supabase para toda la biblioteca, mejor que vivan junto al resto del dato del juego.
- **`categorias` como tabla propia**, no un `enum`/texto suelto en `games`, con `categoria_id` como FK. Permite que los chips de la biblioteca salgan de una consulta real en vez de un array fijo.
- **Se siembran las 4 categorías originales (incluida VERSUS)**, aunque hoy ningún juego real la use — decisión explícita del usuario, pensando en un futuro juego de esa categoría.
- **`plays` es un contador real**, no un mock sembrado con el número decorativo antiguo. Se siembra en `0` y sube con `increment_game_plays()` al empezar cada partida — decisión explícita del usuario, coherente con que `scores` tampoco arranca con datos falsos.
- **`increment_game_plays` es `security definer` con `grant` a `anon` y `authenticated`**, en vez de abrir un `update` público sobre `games` — evita que cualquiera pueda cambiar cualquier otra columna del juego, solo permite sumar una partida.
- **`dificultad`, `jugadores` y `perifericos` son campos reales de la ficha**, no solo almacenamiento sin uso — sustituyen a las etiquetas fijas (`1 JUGADOR`, `TECLADO / TÁCTIL`, las estrellas fijas) que ya existían en `app/juego/[id]/page.tsx`. Decisión explícita del usuario tras revisar esa página.
- **`perifericos` guarda valores atómicos combinables** (`teclado`, `raton`), no las etiquetas compuestas como cadena — permite un `check` sencillo y que la ficha combine el texto en presentación. Decisión explícita del usuario.
- **`Game.id` (en el tipo de frontend) sigue siendo el `slug`**, no el `uuid` interno de `games` — evita tocar todos los componentes que ya usan `game.id` como segmento de ruta o clave de `ENGINES`. El `uuid` queda oculto detrás de `lib/supabase/games.ts`/`lib/supabase/scores.ts`.
- **Estado vacío explícito en vez de ceros o tablas en blanco** ("AÚN NADIE HA JUGADO", "AÚN NO HAS JUGADO", "—") — decisión explícita del usuario: mostrar un cero sería indistinguible de una puntuación real de 0.
- **La rama decorativa de `game-player.tsx` se borra en esta spec**, junto con su test — decisión explícita del usuario: con los 3 juegos reales siempre hay motor, esa rama ya no es alcanzable.
- **Las vidas/niveles del motor (`ENGINES`) NO pasan a leerse de `games.vidas`/`games.niveles` en esta spec** — es un cambio aparte que no se pidió; se queda fuera de alcance explícito.
- **El guardado real de una partida sigue fuera de esta spec** — solo se cambia la lectura de puntuaciones, no la escritura.

## Riesgos identificados

- `increment_game_plays` se llama desde el cliente al montar `game-player.tsx`; una recarga de página cuenta como una partida nueva empezada — es el comportamiento que se pidió ("al empezar la partida"), pero conviene que quede claro que no distingue una partida completada de una abandonada a los dos segundos.
- El join de `getGames()` con `categorias` y con el agregado `MAX(score)` de `scores` son dos fuentes distintas; si en el futuro se añade un juego a `games` sin fila en `categorias`, `getGames()` debe decidir cómo fallar (la FK `not null` ya lo impide a nivel de base de datos, así que no debería poder ocurrir).
