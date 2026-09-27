# SPEC 18 — Guardado real de puntuaciones en `scores`

**Estado:** Implementado
**Depende de:** SPEC 16 (tabla `scores` y su RLS), SPEC 17 (catálogo real, lectura de `scores`), SPEC 07 (invitado anónimo real)
**Fecha:** 2026-09-27
**Objetivo:** Hacer que "GUARDAR PUNTUACIÓN" inserte de verdad una fila en `public.scores` al terminar una partida (por fin de juego o por abandono con el botón FIN) solo cuando el resultado supera la mejor marca anterior del jugador en ese juego, en vez de marcar un estado local decorativo o guardar cada intento; que ese guardado sobreviva al viaje completo por `/auth` — incluida la creación de una cuenta nueva con confirmación por correo —; y que las vidas y el tope de nivel de cada motor pasen a leerse de `public.games` en vez de constantes fijas en código.

## Alcance

**Dentro:**

- Función Postgres `save_score(p_slug text, p_score integer, p_level integer)`, `security definer`, que resuelve el `game_id` a partir del `slug`, verifica que quien llama es un usuario real (no invitado), calcula la mejor marca anterior del usuario en ese juego (`MAX(score)`) y **solo inserta si el resultado es estrictamente mayor**; devuelve siempre si fue récord y cuál era la marca anterior, tanto si insertó como si no.
- `components/game-player.tsx` conoce la mejor marca del jugador para ese juego (`initialBest`, ver más abajo) antes de que se abra el modal de fin, y decide sin llamar al servidor si el resultado actual es un récord:
  - **Es récord:** botón "GUARDAR PUNTUACIÓN", que llama a `supabase.rpc("save_score", …)` con la puntuación y el nivel de la partida (`run.score`, `run.level`) — tanto si el modal lo abrió el motor (`onOver`, partida perdida) como si lo abrió el jugador con el botón FIN (abandono). Estados: `GUARDANDO…` mientras la petición está en curso (botón deshabilitado), `▸ ¡NUEVA MARCA PERSONAL! {score}` (con `(ANTES {marca anterior})` si ya había una) si el insert tuvo éxito, y un aviso de error con el mismo botón para reintentar si falla.
  - **No es récord:** sin botón ni petición de red — mensaje directo `TU MEJOR MARCA EN {JUEGO} SIGUE SIENDO {marca}`.
- `app/jugar/[id]/page.tsx` resuelve la sesión (`getServerSession()`) y, si hay sesión real (no invitado), pasa `getUserBestScore(id, session.id)` a `GamePlayer` como el nuevo prop `initialBest?: number | null`. Ambas funciones ya existen (`lib/supabase/session.ts`, `lib/supabase/scores.ts`), sin cambios en ellas.
- La partida recuperada al volver de `/auth` (`?puntuacion=&nivel=`) deja de marcarse como guardada por defecto: en cuanto el reproductor monta con esa partida y una sesión real, si es récord dispara el guardado automáticamente (mismo `save_score`, mismo manejo de éxito/error); si no lo es, muestra directamente el mensaje de "no es récord" sin intentar guardar. Antes de este cambio se fijaba `saved = true` sin haber insertado nada.
- Regenerar `lib/supabase/types.ts` para que incluya `save_score` en `Database["public"]["Functions"]` con su nuevo tipo de retorno (`{ is_new_record: boolean; previous_best: number | null }`).
- **Vidas y niveles del motor leídos de `public.games`** (antes fuera de alcance, ver decisiones): `lib/supabase/games.ts` expone `vidas`/`niveles` de cada juego; `components/game-player.tsx` deja de importar las constantes `LIVES` de `lib/tetris.ts`/`lib/asteroids.ts`/`lib/arkanoid.ts` y usa `game.vidas`/`game.niveles` como vidas iniciales y tope de nivel reales.
- **Bug encontrado durante esta spec:** en `components/auth-form.tsx`, `signUp()` construye el enlace de confirmación de correo del alta con `emailRedirectTo` apuntando solo a `/auth/confirm`, sin arrastrar el parámetro `next` — a diferencia del botón de OAuth, que sí lo añade a su `redirectTo`. Consecuencia real: un invitado que termina partida, pulsa "INICIA SESIÓN PARA GUARDAR" y **crea una cuenta nueva** (en vez de iniciar sesión con una ya existente) pierde el `next` — y con él la partida pendiente — en el correo de confirmación: `app/auth/confirm/route.ts` no recibe ningún `next` y cae a su valor por defecto (`/biblioteca`). Se corrige añadiendo el mismo `next` que `AuthForm` ya lee de la URL (`searchParams.get("next")`) al `emailRedirectTo` de `signUp()`, igual que ya hace el flujo de OAuth con `redirectTo`. Además, `supabase/templates/confirmation.html` construía el enlace con `{{ .RedirectTo }}?token_hash=…` (un `?` fijo): con `next` ya metido en `.RedirectTo`, ese segundo `?` dejaba el enlace mal formado y `verifyOtp` fallaba. Se cambia a `&`.
- **Bugs encontrados al probar con datos reales por primera vez** (`scores` llevaba vacía desde la SPEC 16; esta spec es la primera vez que se ve una fila de verdad en pantalla):
  - `components/leaderboard.tsx` usaba `key={r.name}` en la lista de `.lb-row`; con la misma persona superando su marca más de una vez (SPEC 18 guarda cada superación, no solo la última), dos filas del mismo jugador comparten `name` y React avisaba de claves duplicadas. Pasa a `key={r.rank}`, que ya es único por fila.
  - `ScoreRow.date` (`lib/supabase/scores.ts`) pintaba `created_at` tal cual llega de Postgres (`2026-09-27T11:55:05.963637+00:00`) en `leaderboard.tsx` y `hall-of-fame.tsx`. Nuevo `formatDate()` en `scores.ts` (`new Date(iso).toLocaleDateString("es-ES")`) aplicado en `getLeaderboard()`, así que ambos componentes lo reciben ya formateado.
  - En `/salon`, "AÚN NO HAS JUGADO" (`components/hall-of-fame.tsx`) es el único hijo de una fila `.tr` con `display: grid; grid-template-columns: 70px 1fr 1fr 140px`: al no ocupar más que la primera columna (70px), el texto se partía en varias líneas. Se le añade `gridColumn: "1 / -1"` y `textAlign: "center"`, igual que ya hace `.tr.you-label` para su propia fila.
  - "AÚN NADIE HA JUGADO" en `components/leaderboard.tsx` tenía `padding: "24px 0"` (sin margen horizontal) mientras el encabezado `<h3>MEJORES PUNTUACIONES</h3>` usa `padding: 14px 16px`; el mensaje quedaba pegado al borde en vez de alineado con el título. Pasa a `padding: "24px 16px"`.

**Fuera de alcance (explícito):**

- Guardado de puntuación para invitados (`is_anonymous: true`). Se mantiene el flujo actual: un invitado ve "INICIA SESIÓN PARA GUARDAR" y nunca llega a llamar a `save_score`; la función además rechaza la llamada aunque se invoque directamente, por si acaso.
- Edición o borrado de una puntuación ya guardada — `scores` sigue siendo un historial inmutable de solo-insert (SPEC 16); esta spec cambia _cuándo_ se inserta una fila (solo si es récord), no si las filas existentes pueden tocarse después.
- Cambios de fondo en `getLeaderboard`, `getBestScores` o `getUserBestScore` (`lib/supabase/scores.ts`) — ya leen de `scores` desde la SPEC 17; el único cambio que sí entra es el formato de fecha, un bug de presentación que nunca se había visto con la tabla vacía (ver más abajo), no una reconsulta distinta.
- Cambios en `increment_game_plays` o en el contador `games.plays` — siguen contando "partida empezada", sin relación con si se guarda o no una puntuación al final.
- Una UI de administración para editar `games.vidas`/`games.niveles` — se siguen editando solo por migración, como el resto del catálogo desde la SPEC 17.

## Modelo de datos

Migración nueva (`supabase/migrations/<timestamp>_guardar_puntuacion.sql`), que **añade** sobre el esquema existente sin tocar las migraciones ya aplicadas:

```sql
-- save_score: guarda de verdad una partida jugada, pero solo si supera la
-- mejor marca anterior del usuario en ese juego. security definer porque
-- resuelve slug -> game_id, calcula esa marca anterior y valida al llamante
-- antes de insertar; solo se concede a authenticated (nunca a anon) y además
-- rechaza a un invitado real (is_anonymous = true), que sigue teniendo que
-- iniciar sesión de verdad.
create or replace function public.save_score(
  p_slug text,
  p_score integer,
  p_level integer
)
returns table (is_new_record boolean, previous_best integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_is_anonymous boolean;
  v_previous_best integer;
begin
  select is_anonymous into v_is_anonymous
  from auth.users
  where id = auth.uid();

  if v_is_anonymous is not false then
    raise exception 'guardado no disponible para invitados';
  end if;

  select id into v_game_id
  from public.games
  where slug = p_slug;

  if v_game_id is null then
    raise exception 'juego % no encontrado', p_slug;
  end if;

  select max(score) into v_previous_best
  from public.scores
  where user_id = auth.uid() and game_id = v_game_id;

  if v_previous_best is not null and p_score <= v_previous_best then
    return query select false, v_previous_best;
    return;
  end if;

  insert into public.scores (user_id, game_id, score, level)
  values (auth.uid(), v_game_id, p_score, p_level);

  return query select true, v_previous_best;
end;
$$;

revoke execute on function public.save_score(text, integer, integer) from public;
grant execute on function public.save_score(text, integer, integer) to authenticated;
```

**Bug encontrado al revisar producción:** este `revoke ... from public` no bastaba. Supabase concede `EXECUTE` a `anon`/`authenticated`/`service_role` por defecto a toda función nueva de `public` (`ALTER DEFAULT PRIVILEGES` a nivel de esquema), y esas concesiones quedan adjuntas por rol en el momento de crear la función — revocar de `public` solo retira el pseudo-rol PUBLIC, no esas concesiones ya hechas. El linter de seguridad de Supabase lo marcó (`anon_security_definer_function_executable`): `save_score` seguía siendo ejecutable por `anon`. No era explotable — `auth.uid()` es `null` para una llamada `anon` de verdad, sin sesión, y `v_is_anonymous is not false` trata ese `null` como "no es false" y rechaza igual que a un invitado —, pero no coincidía con el diseño documentado aquí ("solo se concede a authenticated, nunca a anon"). Segunda migración (`supabase/migrations/<timestamp>_revocar_anon_save_score.sql`):

```sql
revoke execute on function public.save_score(text, integer, integer) from anon;
```

No hay cambios de columnas ni de políticas RLS: la policy de insert de la SPEC 16 (`cada cual guarda su propia partida`, `check (auth.uid() = user_id)`) ya cubre lo que la función necesita — la función solo añade la resolución de `slug`, la comparación con la mejor marca anterior y el rechazo explícito de invitados antes de llegar a esa policy. Un empate exacto (`p_score = v_previous_best`) cuenta como "no es récord": la comparación es `<=`, no `<`.

### Vidas y niveles reales desde `games` (sin migración)

Las columnas `vidas` y `niveles` ya existen en `public.games` desde la SPEC 16 y ya están sembradas con los mismos valores que hoy usan las constantes de código (`tetrix`: vidas 1, niveles 10; `asteroides`: vidas 1, niveles `null` = infinito; `arkanoid`: vidas 3, niveles `null` = infinito) — pero `lib/supabase/games.ts` no las selecciona ni las expone todavía. Este punto no toca el esquema, es solo código de aplicación:

- `lib/supabase/games.ts`: añadir `vidas, niveles` a `GAME_COLUMNS`; añadir `vidas: number; niveles: number | null;` al tipo `Game` y al mapeo de `toGame()`.
- `lib/tetris.ts`: `createState(lives: number, maxLevel: number | null)` en vez de `createState()` sin argumentos; `TetrisState` guarda `maxLevel`; `levelFor(lines, maxLevel)` — `null` = sin tope, un número = `Math.min(maxLevel, …)` (misma fórmula de hoy, parametrizada). Se retiran los exports `LIVES` y `MAX_LEVEL`.
- `lib/asteroids.ts` y `lib/arkanoid.ts`: `createState(lives: number)` en vez de `createState()`; se retira el export `LIVES` de cada uno — sus niveles ya eran infinitos por diseño (SPEC 14/15), así que solo necesitan vidas iniciales configurables.
- `components/tetris-game.tsx` / `asteroids-game.tsx` / `arkanoid-game.tsx`: leen los nuevos campos `initialLives`/`maxLevel` del contrato `EngineProps` y los pasan a `createState(...)`. Asteroides y Arkanoid reciben `maxLevel` (porque `EngineProps` es un contrato común a los tres, para que `ENGINES` los invoque de forma polimórfica) pero no lo usan — su `games.niveles` sembrado es `null` y sus reglas ya son "sin final" por diseño.
- `components/game-player.tsx`: `EngineProps` gana `initialLives: number` y `maxLevel: number | null`; se retiran los tres imports `LIVES as …_LIVES`; `ENGINES` deja de tener el campo `lives` por motor; `initialRun` pasa a `{ score: 0, lives: game.vidas, level: 1 }`; el `<engine.Component>` recibe `initialLives={game.vidas}` y `maxLevel={game.niveles}`.

## Plan de implementación

1. Migración `supabase/migrations/<timestamp>_guardar_puntuacion.sql` con el SQL de `save_score` de arriba (`returns table`). `db reset` local; verificar a mano desde `psql`/Studio que llamarla dos veces seguidas con el mismo usuario (segunda con score menor o igual) devuelve `is_new_record = false` sin insertar, y que llamarla como invitado lanza la excepción.
2. Regenerar `lib/supabase/types.ts` (`npx supabase gen types typescript`), incluyendo el nuevo tipo de retorno de `save_score`.
3. `lib/supabase/games.ts`: añadir `vidas`/`niveles` a `GAME_COLUMNS`, al tipo `Game` y al mapeo de `toGame()`.
4. `lib/tetris.ts`: `createState(lives, maxLevel)` parametrizado, `TetrisState` guarda `maxLevel`, `levelFor(lines, maxLevel)`; retirar `LIVES` y `MAX_LEVEL`.
5. `lib/asteroids.ts` y `lib/arkanoid.ts`: `createState(lives)` parametrizado; retirar `LIVES` de cada uno.
6. `components/tetris-game.tsx`, `components/asteroids-game.tsx`, `components/arkanoid-game.tsx`: leer `initialLives`/`maxLevel` de sus props y pasarlos a `createState(...)`.
7. `components/game-player.tsx`:
   - `EngineProps` gana `initialLives: number` y `maxLevel: number | null`; se retiran los imports `LIVES as …_LIVES`; `ENGINES` pierde el campo `lives` por motor; `initialRun` pasa a `{ score: 0, lives: game.vidas, level: 1 }`; el `<engine.Component>` recibe `initialLives={game.vidas}` y `maxLevel={game.niveles}`.
   - Nuevo prop `initialBest?: number | null`; estado `bestScore` inicializado con él; `isRecord = bestScore === null || run.score > bestScore` derivado en cada render (nunca guardado aparte).
   - Estados `saving`, `saveError` y `previousBestAtSave` (booleano, booleano, `number | null`) junto a `saved`; `saved` para una partida recuperada (`recuperada`) arranca en `false`, no en `true`.
   - `handleSave` (async): pone `saving = true`, `saveError = false`; llama `supabase.rpc("save_score", { p_slug: game.id, p_score: run.score, p_level: run.level }).single()`; en éxito, `setBestScore(data.is_new_record ? run.score : data.previous_best)`, y si `data.is_new_record` además `setPreviousBestAtSave(data.previous_best)` y `setSaved(true)`; si `error`, `setSaveError(true)`; en ambos casos `setSaving(false)` al final.
   - Modal: si `isRecord && !saved`, botón "GUARDAR PUNTUACIÓN" que llama `handleSave` (texto "GUARDANDO…" y deshabilitado mientras `saving`; aviso "NO SE PUDO GUARDAR_" con el mismo botón activo si `saveError`); si `saved`, `▸ ¡NUEVA MARCA PERSONAL! {run.score}` con `(ANTES {previousBestAtSave})` cuando no es `null`; si `!isRecord`, sin botón, `TU MEJOR MARCA EN {game.title} SIGUE SIENDO {bestScore}`.
   - `useEffect` de auto-guardado para la partida recuperada de `/auth`: cuando `recuperada && !isGuest && !saved && !saving && isRecord`, llama `handleSave` una vez al montar; si `isRecord` es falso no hace nada (el modal ya pinta la rama de "no es récord" con el `bestScore` inicial).
8. `app/jugar/[id]/page.tsx`: resolver `getServerSession()` y, si hay sesión real (no invitado), pasar `getUserBestScore(id, session.id)` como `initialBest` a `GamePlayer`.
9. `app/globals.css`: estilo mínimo para el aviso de error y el mensaje de "no es récord" dentro del modal (reutilizar clases existentes como `.mono`/`.ink-dim` donde alcance; añadir una clase nueva solo si hace falta un color de aviso).
10. `components/auth-form.tsx`: en `signUp()`, añadir el parámetro `next` a la URL de `emailRedirectTo` (hoy apunta solo a `/auth/confirm`). La variable `next` ya existe en el ámbito de la función — es la misma que lee `useSearchParams()` arriba en el componente — así que basta con interpolarla igual que ya hace `redirectTo` en `oauth()`.
11. Verificación manual en local (Mailpit, `npx supabase status` da su URL): jugar TETRIX y terminar con una puntuación baja (primera marca, se guarda con el copy de nueva marca); jugar de nuevo con una puntuación menor (no debe ofrecer guardar, debe mostrar "sigue siendo tu mejor marca"); jugar una tercera vez superando la primera marca (debe guardar y mostrar "antes X"). Repetir terminando con el botón FIN a mitad de partida. Repetir el flujo de invitado → `/auth` → **crear cuenta nueva** → confirmar el correo desde Mailpit → comprobar que el enlace vuelve a `/jugar/[id]?puntuacion=&nivel=` y la partida se autoguarda si es récord (o muestra "no es récord" si no lo es). Repetir también el flujo de invitado → `/auth` → iniciar sesión con una cuenta ya existente. Simular un fallo (cortar red o forzar un slug inválido) y confirmar el aviso y el reintento. Cambiar a mano `vidas`/`niveles` de un juego en `games` y confirmar que el HUD y el motor reflejan el cambio al recargar `/jugar/[id]`, sin tocar código; devolver el valor original al terminar.
12. `npx supabase db push` al proyecto remoto antes de mergear a `main` (regla "la base de datos primero"). El fix de `auth-form.tsx` y el de `lib/supabase/games.ts` no tocan esquema, pero entran en el mismo despliegue de código.

## Criterios de aceptación

- [ ] La primera vez que un usuario termina una partida en un juego (sin marca previa), su resultado siempre cuenta como récord y se guarda.
- [ ] Superar la mejor marca anterior (game-over real o abandono con FIN) guarda una fila nueva en `public.scores` con el `user_id`, `game_id`, `score` y `level` correctos, y el modal muestra "▸ ¡NUEVA MARCA PERSONAL! {score}" con "(ANTES {marca anterior})".
- [ ] Un resultado igual o menor que la mejor marca anterior (incluido un empate exacto) no dispara ninguna llamada a `save_score`; el modal muestra directamente "TU MEJOR MARCA EN {JUEGO} SIGUE SIENDO {marca}".
- [ ] Un invitado (`is_anonymous: true`) sigue viendo "INICIA SESIÓN PARA GUARDAR" y no se genera ninguna fila en `scores` para esa sesión.
- [ ] Volver de `/auth` con una partida recuperada que sí es récord, ya con sesión real, guarda la puntuación automáticamente sin que el jugador tenga que pulsar nada; si no es récord, muestra directamente el mensaje de "no es récord" sin intentar guardar.
- [ ] Un invitado que termina partida, pulsa "INICIA SESIÓN PARA GUARDAR" y **crea una cuenta nueva** (alta con email/contraseña) conserva la partida pendiente: el enlace del correo de confirmación vuelve a `/jugar/[id]?puntuacion=&nivel=` y se aplica la misma regla de récord, igual que si hubiera iniciado sesión con una cuenta existente.
- [ ] Si `save_score` falla, el modal muestra un aviso y el botón permite reintentar; un reintento que sí tenga éxito termina mostrando el copy de nueva marca.
- [ ] Llamar a `save_score` directamente como usuario anónimo (sin pasar por la UI) lanza una excepción y no inserta nada.
- [ ] El rol `anon` no tiene `EXECUTE` sobre `save_score` en el proyecto remoto (`get_advisors` de Supabase sin el hallazgo `anon_security_definer_function_executable` para esta función).
- [ ] El salón (`/salon`) y la ficha de cada juego (`/juego/[id]`) muestran las puntuaciones reales recién guardadas.
- [ ] Dos filas del mismo jugador en la misma tabla (dos superaciones suyas) no disparan el aviso de React de claves duplicadas.
- [ ] La fecha de una puntuación se ve como fecha (`27/9/2026`), nunca como el `created_at` ISO completo, ni en `/juego/[id]` ni en `/salon`.
- [ ] En `/salon`, "AÚN NO HAS JUGADO" se pinta en una sola línea horizontal, centrada en el ancho de la fila.
- [ ] En la ficha de un juego sin puntuaciones, "AÚN NADIE HA JUGADO" queda alineado con el margen izquierdo de "MEJORES PUNTUACIONES".
- [ ] `getGameBySlug()`/`getGames()` devuelven `vidas` y `niveles` reales de la fila de `games`.
- [ ] Las vidas iniciales de cada motor (corazones del HUD y estado interno) vienen de `game.vidas`; el tope de nivel de TETRIX viene de `game.niveles`, no de la constante `MAX_LEVEL` retirada; `LIVES` y `MAX_LEVEL` ya no existen como exports de `lib/tetris.ts`, `lib/asteroids.ts` ni `lib/arkanoid.ts`.
- [ ] Cambiar `vidas` o `niveles` de un juego directamente en `games` (en local) cambia el comportamiento real del motor la siguiente vez que se juega, sin tocar código.
- [ ] `npm run build`, `npx tsc --noEmit`, `npm run lint` y `npm test` (suite completa) pasan.

## Decisiones tomadas y descartadas

- **`save_score` como función `security definer`**, igual que `increment_game_plays`, en vez de un `insert` directo desde el cliente contra `scores` — mantiene la resolución de `slug → game_id` y la validación de invitado del lado de Postgres, coherente con la regla del proyecto ("Postgres filtra, la función orquesta") ya aplicada en la purga de invitados.
- **Se mantiene el bloqueo de guardado para invitados**, aunque la policy de `scores` ya lo permitiría (un invitado es un `user_id` real bajo RLS) — decisión explícita del usuario: no reabrir esa parte del modelo de identidad de la SPEC 07 en esta spec.
- **El rechazo de invitado vive dentro de la función, no solo en la UI** — un invitado con herramientas de desarrollador no debería poder llamar `save_score` directamente aunque el botón esté oculto para él.
- **La partida recuperada de `/auth` pasa a guardarse sola** en vez de marcarse como guardada sin insertar nada — es la razón de ser de ese viaje de ida y vuelta: el jugador fue a iniciar sesión específicamente para no perder esa puntuación.
- **Solo se guarda una fila cuando el resultado supera la mejor marca anterior del usuario para ese juego** — decisión explícita del usuario tras detectar que un diseño de "una fila por partida" llenaría `scores` de resultados irrelevantes; lo que importa para un leaderboard es la mejor marca, no el historial completo de intentos.
- **Se implementa por inserción condicional, no por upsert** — mantiene la regla de SPEC 16 de que `scores` es un historial solo-insert (sin `update`/`delete`); las filas que sobreviven son "marcas personales sucesivas", no "cada partida jugada".
- **El cliente pre-filtra antes de llamar a `save_score`** usando la mejor marca ya conocida (`initialBest`/`bestScore`), para no gastar una llamada de red cuando el jugador ya sabe que no ha superado su marca; el servidor igualmente vuelve a comprobarlo (nunca confía en el cliente) y responde sin insertar si no procede, por si el estado del cliente estuviera desfasado (p. ej. dos pestañas).
- **Empate no cuenta como récord** — "superar" implica estrictamente mayor, decisión explícita del usuario.
- **Sin cambios en las funciones de lectura** (`getLeaderboard`, `getBestScores`, `getUserBestScore`) — ya apuntan a `scores`; las filas nuevas aparecen solas.
- **El fix del `next` perdido en `signUp()` entra en esta spec** aunque es un bug de `auth-form.tsx` y no del guardado en sí — decisión explícita del usuario: es el mismo síntoma (partida pendiente que se pierde) y la misma causa raíz (el viaje de ida y vuelta por `/auth` no preserva la partida), así que se corrige junto con el resto en vez de abrir una spec aparte solo para una línea.
- **Las vidas y el tope de nivel del motor pasan a leerse de `games.vidas`/`games.niveles`, revirtiendo lo marcado "fuera de alcance" en la SPEC 17** — decisión explícita del usuario; evita que la constante en código y la fila en base de datos puedan divergir. No toca esquema: las columnas y su semilla ya existían desde SPEC 16.
- **`EngineProps` gana `initialLives`/`maxLevel` compartidos por los tres motores aunque solo TETRIX use `maxLevel`** — mantiene el contrato uniforme que exige `ENGINES: Record<string, { Component: ComponentType<EngineProps>; screen: string }>`; tipar cada motor con props distintas rompería esa uniformidad para ganar muy poco.
- **Los cuatro bugs de presentación con datos reales se corrigen en esta misma spec**, aunque ninguno estaba en el plan original — decisión explícita del usuario: son consecuencia directa de que `scores` deja de estar vacía por primera vez (SPEC 16/17 nunca los pudieron ver), el mismo criterio ya usado para el bug de `signUp()`.
- **`formatDate()` vive en `lib/supabase/scores.ts`, no en los componentes** — `ScoreRow.date` llega ya formateado a `leaderboard.tsx` y `hall-of-fame.tsx`; ninguno de los dos necesita saber que el origen es un ISO 8601 de Postgres.
- **El `revoke ... from anon` de `save_score` va en una segunda migración, no reescribiendo la primera** — la primera ya estaba aplicada en remoto cuando se detectó el hallazgo; el proyecto no permite editar una migración ya aplicada, así que la corrección es aditiva, como cualquier otro cambio de esquema posterior.

## Riesgos identificados

- Doble clic rápido en "GUARDAR PUNTUACIÓN" antes de que `saving` se refleje en el DOM podría disparar dos llamadas a `save_score` — la comprobación server-side evita una segunda fila más baja, pero el cliente que "pierda" esa carrera debe reflejar el `previous_best` que le devuelve el servidor, no el que tenía en memoria; cubierto por sincronizar `bestScore` con la respuesta en cualquier caso (récord o no), pero conviene confirmarlo a mano en la verificación manual.
- El auto-guardado al volver de `/auth` depende de que `restored` y la sesión real ya estén disponibles en el primer render del efecto; si `useSession()` tarda en resolver el usuario, el efecto podría no ver `isGuest` en su valor final la primera vez — probar explícitamente ese camino (invitado → auth → vuelta) en la verificación manual, no solo el guardado manual normal.
- Esta spec reabre tres módulos ya marcados `Implementado` (SPEC 13/14/15) y sus bloques de test en `tests/screens.spec.ts`. Los valores sembrados en `games` coinciden hoy con las constantes que se retiran, así que el comportamiento visible no debería cambiar — pero conviene correr la suite completa (`npm test`), no solo verificación manual, antes de dar esto por cerrado.
- No hay UI de administración para `games.vidas`/`niveles`: cualquier edición futura de esos valores (solo posible a mano, vía migración o consola) pasa a tener efecto real sobre el motor. El `check` de la migración de SPEC 16 (`vidas > 0`, `niveles is null or niveles > 0`) sigue siendo la única validación.
