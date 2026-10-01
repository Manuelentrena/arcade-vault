# SPEC 27 — Consultas redundantes, redirección de invitado y actividad real del home

> **Estado:** Implementado
> **Depende de:** SPEC 04 (home y `/biblioteca`), SPEC 06 (Supabase Auth real), SPEC 07 (modo invitado), SPEC 16 (tablas `games`/`scores`), SPEC 17 (catálogo real), SPEC 18 (guardado real de puntuaciones), SPEC 26 (versión y blog de cambios)
> **Versión:** Fix
> **Fecha:** 2026-10-02
> **Objetivo:** Cerrar tres defectos independientes — las consultas redundantes a Supabase que ralentizan `/juego/[id]` y `/jugar/[id]`, la redirección rota tras entrar como invitado, y las tablas del home que siguen mostrando actividad decorativa en vez de leer `scores`/`profiles` reales — sin tocar las reglas de ningún motor ni el flujo de email/password u OAuth.

## Punto de partida

Los tres son defectos independientes, con causa y archivos distintos, bundlados en un solo spec porque el usuario los reportó juntos y ninguno merece una rama propia.

### 1. `/juego/[id]` y `/jugar/[id]` tardan o no cargan

`lib/supabase/games.ts` → `getGameBySlug(slug)` hace tres cosas en secuencia: consulta `games` por `slug`, y luego llama a `getBestScores()` — que hace `select("game_id, score")` de **toda** la tabla `scores`, sin filtro, solo para sacar el mejor de un único juego. Es un full-table scan donde bastaría una fila.

Encima, `app/juego/[id]/page.tsx` llama `getGameBySlug(id)` y después `getLeaderboard(id, 10)` — y `getLeaderboard` (`lib/supabase/scores.ts`) empieza con `gameIdForSlug(slug)`, que **vuelve a consultar `games` por el mismo slug** que `getGameBySlug` ya había resuelto una línea antes. Las dos llamadas son secuenciales (`await` uno tras otro), no en paralelo.

`app/jugar/[id]/page.tsx` acumula un escalón más: `getGameBySlug(id)` (con su propio `getBestScores()` de tabla completa) → `getServerSession()` → `getUserBestScore(id, session.id)`, que **también** vuelve a resolver `slug` → `game_id` desde cero. Son 4-5 round-trips secuenciales a Supabase donde el dato cabe en 2 consultas paralelizadas.

### 2. Entrar como invitado no redirige a `/biblioteca`

`components/auth-form.tsx` → `playAsGuest()` sigue el mismo patrón que `signIn()` (que funciona): `await supabase.auth.signInAnonymously(...)`, luego `router.push(next)` y `router.refresh()`. El usuario confirma que la sesión **sí** se crea — el nav pinta el nombre de invitado — pero la URL se queda en `/auth`: el `router.push(next)` no navega.

La diferencia con `signIn()` es la ruta de origen: el nav enlaza a `/biblioteca` con `<Link>`, que Next.js precarga (prefetch) en cuanto el enlace entra en el viewport de `/auth` — **antes** de que exista sesión. `signInWithOAuth` ya evita esto en el mismo archivo (`window.location.assign(data.url)`, línea 305): una navegación dura, no cacheada por el router de Next. `playAsGuest` es la única de las tres vías de entrada (password, OAuth, invitado) que no usa ese patrón.

### 3. Las tablas del home no leen Supabase

`components/home/home-activity.tsx` lo dice en su propio comentario: _"Actividad decorativa: no sale de `lib/scores.ts` ni se persiste."_ `TICKER` (para "ÚLTIMAS PUNTUACIONES") y `TOP` (para "TOP JUGADORES · HOY") son arrays hardcodeados con nombres y puntuaciones inventados — nunca se tocó en SPEC 16/17/18 porque entonces el catálogo real todavía no existía.

## Alcance

**Dentro:**

- `lib/supabase/scores.ts`: nueva función `getBestScoreForGame(gameId: string): Promise<number | null>` que consulta `scores` filtrando por ese `game_id` (no la tabla entera).
- `lib/supabase/games.ts`: `getGameBySlug` usa `getBestScoreForGame` en vez de `getBestScores()`; `toGame()` pasa a recibir el mejor resultado ya resuelto (`number | null`) en vez del mapa completo, con dos sitios de llamada (`getGames()` sigue usando el mapa completo porque pinta el catálogo entero; `getGameBySlug` pasa el valor único).
- `app/juego/[id]/page.tsx`: `getGameBySlug(id)` y `getLeaderboard(id, 10)` se piden con `Promise.all`, en paralelo.
- `app/jugar/[id]/page.tsx`: `getGameBySlug(id)` y `getServerSession()` se piden con `Promise.all`, en paralelo; `getUserBestScore` sigue después porque depende del resultado de la sesión.
- `components/auth-form.tsx`: `playAsGuest()` cambia `router.push(next); router.refresh();` por `window.location.assign(next)`, igual que ya hace `oauth()` en el mismo archivo — navegación dura que no depende de la caché de prefetch del router de Next.
- `lib/supabase/scores.ts`: dos funciones nuevas, siguiendo el mismo patrón de agregación en JS que ya usa `getBestScores()`:
  - `getRecentScores(limit = 7): Promise<RecentScore[]>` — las últimas `limit` filas de `scores` por `created_at` descendente, con `profiles(username)` y `games(nombre, color)` vía join, más un `when` relativo ("hace 2 min" / "hace 3 h" / "hace 1 d") calculado en el momento de la petición.
  - `getTopPlayers(limit = 6): Promise<TopPlayer[]>` — mejor puntuación individual de cada jugador en cualquier juego (no suma), rankeado descendente; se calcula en JS igual que `getBestScores()` (traer `user_id, score, profiles(username)` y reducir), no con un `GROUP BY` en SQL.
- Nueva migración: `create index scores_created_at_idx on public.scores (created_at desc);` — `getRecentScores` ordena por `created_at` sin filtrar por `game_id`, así que no puede apoyarse en el índice compuesto `scores_game_id_score_idx` que ya existe. Aditiva, no rompe nada existente.
- `app/api/home-activity/route.ts` (nuevo, `GET`): llama a `getRecentScores()` y `getTopPlayers()` en paralelo y devuelve `{ recent, top }` como JSON. Es el único sitio desde el que `home-activity.tsx` pide estos datos — se piden solo cuando el navegador los solicita, no en cada render del home.
- `components/home/home-activity.tsx` pasa a ser `"use client"`. Pierde los arrays `TICKER`/`TOP` y ya no recibe `recent`/`top` por props: en su lugar usa un `IntersectionObserver` sobre la propia sección para pedir `/api/home-activity` **solo la primera vez que entra en el viewport** (`rootMargin` con margen de adelanto para que el fetch termine antes de que el usuario llegue a verla del todo; el observer se desconecta tras el primer disparo, no vuelve a pedir nada). Mientras no ha intersectado o la petición está en curso, pinta un esqueleto (filas atenuadas, mismo alto que las reales, sin texto inventado); al resolver, pinta las filas reales o el estado vacío si el array llega vacío. Quita el rótulo "· HOY" del título ("TOP JUGADORES" a secas).
- Tests nuevos en `tests/screens.spec.ts` para las tres correcciones.
- Fila de la SPEC 27 en el índice de specs del `README.md`.
- Cierre estándar: bump de versión Fix (sin post de changelog).

**Fuera de alcance (explícito):**

- Cualquier cambio a las reglas de un motor (`lib/tetrix.ts`, etc.) o al contrato `ENGINES`/`EngineProps`.
- Tiempo real/polling en las tablas del home: siguen siendo SSR normal, como el resto del sitio — sin WebSocket, sin `revalidate` periódico ni actualización en el cliente tras el primer render.
- El flujo de `signIn`/`signUp`/OAuth más allá de lo que ya usan como referencia — no se tocan salvo para copiar el patrón de `window.location.assign` que `oauth()` ya usaba.
- Paginación, filtros o búsqueda en las tablas del home.
- Cambios a políticas RLS de Supabase — las lecturas que este spec añade son del mismo tipo (select público sobre `scores`/`profiles`/`games`) que ya permiten `/juego/[id]` y `/salon` hoy.
- La condición de carrera preexistente entre tests paralelos que compila `PX_KAI` documentada como riesgo conocido en SPEC 26 — no relacionada con estos tres defectos.
- "Top jugadores" como suma de mejores puntuaciones por juego — se usa el máximo individual, ver Decisiones.

## Modelo de datos

No hay tablas ni columnas nuevas. Una migración aditiva (el índice `scores_created_at_idx`, ver Alcance) y dos tipos TypeScript nuevos en `lib/supabase/scores.ts`:

```ts
export type RecentScore = {
  player: string;
  game: string;
  score: number;
  when: string; // "hace 2 min", calculado en el momento de la petición
  color: GameColor;
};

export type TopPlayer = {
  rank: number;
  player: string;
  score: number;
};
```

## Plan de implementación

1. **`lib/supabase/scores.ts` — `getBestScoreForGame`.** Añadir `getBestScoreForGame(gameId: string): Promise<number | null>` (`select("score").eq("game_id", gameId).order("score", {ascending:false}).limit(1).maybeSingle()`). Verificación manual: en una consola de Node/`tsx` o un log temporal, confirmar que devuelve el mismo valor que hoy calcula `getBestScores()[gameId]`.
2. **`lib/supabase/games.ts` — usar la consulta puntual.** `toGame()` pasa a recibir `best: number | null` en vez del mapa. `getGames()` sigue resolviendo el mapa completo con `getBestScores()` (pinta el catálogo entero, sí lo necesita) y hace `toGame(row, best[row.id] ?? null)` por fila. `getGameBySlug()` llama a `getBestScoreForGame(data.id)` en vez de `getBestScores()`. Verificación manual: `/biblioteca` y `/juego/[id]` siguen mostrando el mismo "mejor global" que antes.
3. **`app/juego/[id]/page.tsx` — paralelizar.** `const [game, scores] = await Promise.all([getGameBySlug(id), getLeaderboard(id, 10)]);`, con el `notFound()` tras resolver `game`. Verificación manual: la página sigue mostrando la ficha y el leaderboard idénticos; medir con las DevTools (pestaña Network/Server Timing o un `console.time` temporal) que el tiempo de respuesta baja frente al mismo juego antes del cambio.
4. **`app/jugar/[id]/page.tsx` — paralelizar lo independiente.** `const [game, session] = await Promise.all([getGameBySlug(id), getServerSession()]);`, luego `notFound()` si `!game`, y `getUserBestScore` después (depende de `session`). Verificación manual: `/jugar/[id]` sigue cargando con el mejor personal correcto para un usuario registrado y `null` para invitado.
5. **`components/auth-form.tsx` — `playAsGuest` con navegación dura.** Cambiar `router.push(next); router.refresh();` por `window.location.assign(next)`, con un comentario que explique por qué (el mismo que ya lleva `oauth()`: evita servir desde la caché de prefetch del router una versión de `/biblioteca` renderizada antes de tener sesión). Verificación manual en **local y en producción** (ambos entornos donde el usuario reprodujo el fallo): pulsar "JUGAR COMO INVITADO" desde `/auth` sin `?next=`, confirmar que aterriza en `/biblioteca` con el nombre de invitado en el nav; repetir llegando desde el rebote de `/jugar/[id]` (con `?next=/jugar/<slug>`) y confirmar que aterriza ahí.
6. **Migración — índice para `getRecentScores`.** Añadir `scores_created_at_idx` en una nueva migración de `supabase/migrations/`. Verificación manual: `npx supabase db reset` aplica la migración sin errores.
7. **`lib/supabase/scores.ts` — `getRecentScores` y `getTopPlayers`.** Añadir ambas funciones y una `relativeTime(iso: string): string` interna ("hace X min" / "hace X h" / "hace X d", igual que el copy ya usado en el mock). Verificación manual: con al menos una fila en `scores` (jugar una partida real en local), ambas funciones devuelven datos coherentes; con la tabla vacía, devuelven `[]`.
8. **`app/api/home-activity/route.ts` — endpoint nuevo.** `GET` que llama a `getRecentScores()` y `getTopPlayers()` en paralelo y devuelve `{ recent, top }`. Verificación manual: `curl localhost:3000/api/home-activity` (con el stack local arriba) devuelve el JSON esperado.
9. **`components/home/home-activity.tsx` — carga diferida con `IntersectionObserver`.** Pasa a `"use client"`; estado local `status: "idle" | "loading" | "loaded"` más `recent`/`top`; un `ref` en la sección y un `useEffect` que crea el `IntersectionObserver` (una vez, se desconecta tras el primer disparo), dispara `fetch("/api/home-activity")` al entrar en viewport y pinta el esqueleto mientras `status !== "loaded"`. Quita `TICKER`/`TOP` y el rótulo "· HOY"; estado vacío ("AÚN NADIE HA JUGADO", mismo estilo que `components/leaderboard.tsx`) cuando el array correspondiente llegue vacío tras cargar. Verificación manual: en `/`, la pestaña Network no muestra la llamada a `/api/home-activity` hasta hacer scroll hasta esa sección; al llegar, se dispara una sola vez.
10. **`tests/screens.spec.ts` — lo nuevo.** Añadir a un bloque existente o uno nuevo:
    - Recién cargado `/` sin hacer scroll, no se ha disparado ninguna petición a `/api/home-activity` (`page.on("request", ...)` o `waitForRequest` con assert negativo).
    - Haciendo `scrollIntoViewIfNeeded()` sobre la sección "ACTIVIDAD EN VIVO" con la base recién reseteada (sin partidas guardadas), tras esperar la respuesta se ve "AÚN NADIE HA JUGADO" en las dos tarjetas.
    - Jugar una partida real hasta guardar un récord (reutilizando el helper que ya usa el bloque `tetrix`/`fin de partida`), volver a `/`, hacer scroll hasta la sección y comprobar que muestra esa puntuación en "ÚLTIMAS PUNTUACIONES" y al jugador en "TOP JUGADORES".
    - Entrar como invitado desde `/auth` sin `next` redirige a `/biblioteca` (móvil y escritorio).
    - Entrar como invitado llegando desde el rebote de `/jugar/[id]` (visitar `/jugar/<slug>` deslogueado, confirmar el rebote a `/auth?next=...`, pulsar invitado, confirmar que aterriza en `/jugar/<slug>`).
11. **`README.md` — fila de la SPEC 27** en el índice de specs.
12. **Cierre:** bump de versión **Fix** — `package.json`, `components/footer.tsx` y la etiqueta `v1.0.0` bajo "ARCADE" en `components/nav.tsx` pasan de `1.0.0` a `1.0.1`. Sin post de changelog (Fix). `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`.

## Criterios de aceptación

- [x] `getBestScoreForGame` consulta solo las filas del `game_id` pedido, no la tabla `scores` completa.
- [x] `/juego/[id]` pide `getGameBySlug` y `getLeaderboard` en paralelo (`Promise.all`), no en secuencia.
- [x] `/jugar/[id]` pide `getGameBySlug` y `getServerSession` en paralelo.
- [x] Jugar como invitado desde `/auth` sin `?next=` aterriza en `/biblioteca`, verificado a mano en local **y** en producción.
- [x] Jugar como invitado llegando desde el rebote de `/jugar/[id]` aterriza en `/jugar/[id]`, no en `/biblioteca`.
- [x] Al cargar `/` sin hacer scroll hasta "ACTIVIDAD EN VIVO", no se dispara ninguna petición a `/api/home-activity`.
- [x] Al hacer scroll hasta "ACTIVIDAD EN VIVO" se dispara exactamente una petición a `/api/home-activity`; volver a salir y entrar en la sección no dispara una segunda.
- [x] El home, con `scores` vacía, muestra "AÚN NADIE HA JUGADO" en ambas tarjetas de "ACTIVIDAD EN VIVO" tras resolver esa petición.
- [x] El home, con al menos una puntuación guardada, muestra esa puntuación real en "ÚLTIMAS PUNTUACIONES" (jugador, juego, puntuación y tiempo relativo correctos) y a ese jugador en "TOP JUGADORES".
- [x] "TOP JUGADORES" ya no lleva el rótulo "· HOY" y rankea por la mejor puntuación individual de cada jugador en cualquier juego.
- [x] `/biblioteca` y `/juego/[id]` siguen mostrando el mismo "mejor global" por juego que antes del cambio.
- [x] `package.json`, `components/footer.tsx` y la etiqueta del logo en `components/nav.tsx` muestran `1.0.1`.
- [x] Como esta spec es `Versión: Fix`, no se crea ninguna entrada nueva en `/blog`.
- [x] `npm run build`, `npx tsc --noEmit`, `npm run lint` y `npm test` pasan.

## Decisiones tomadas y descartadas

- **Sí:** `window.location.assign(next)` para el invitado, no invertir el orden de `push`/`refresh` ni añadir un `setTimeout`. Es el mismo patrón que ya usa `oauth()` con éxito en el mismo archivo, y una navegación dura resuelve de raíz cualquier variante del problema de caché de prefetch sin necesitar instrumentación adicional para confirmarlo.
- **No:** tocar `signIn()`/`signUp()` para que también usen `window.location.assign`. No están reportados como rotos, y cambiarlos sin necesidad arriesga una regresión fuera del alcance de este spec.
- **Sí:** `getBestScoreForGame` como consulta nueva y específica, en vez de cachear o memoizar `getBestScores()`. Es la solución más simple al desperdicio real (traer toda la tabla para un solo valor) y no introduce estado compartido entre requests en un entorno serverless.
- **No:** fusionar `getGameBySlug` y `getLeaderboard`/`getUserBestScore` en una sola función que resuelva el `slug` una única vez. Habría significado exponer el `uuid` interno fuera de `lib/supabase/`, rompiendo la convención explícita de que "las páginas solo conocen el slug". La paralelización con `Promise.all` reduce la latencia percibida sin tocar ese contrato.
- **Sí:** "TOP JUGADORES" por mejor puntuación individual (no por suma). Es la métrica que ya usa cada tabla de `/salon` por juego — extenderla a "la mejor de cualquier juego" no introduce un concepto nuevo. Sumar puntuaciones de juegos distintos (p. ej. TETRIX en puntos, BUSCAMINAS en otra escala) mezclaría unidades sin sentido claro.
- **No:** quitar del todo el concepto de "hoy"/ventana temporal. Se descartó porque `scores` solo guarda récords personales (SPEC 18), no partidas sueltas: un filtro por día dejaría la tabla vacía casi siempre.
- **Sí:** agregar `getRecentScores`/`getTopPlayers` en JavaScript (traer filas y reducir), igual que ya hace `getBestScores()`, en vez de un `GROUP BY`/vista SQL. Mantiene un único patrón de agregación en todo `lib/supabase/scores.ts`; con el volumen de datos de esta app (un puñado de juegos, récords personales, no partidas) no hay problema de rendimiento en traer todas las filas de `scores` para esto — a diferencia del caso de la sección 1.1, aquí sí se necesita la tabla completa porque el ranking es, precisamente, sobre todos los jugadores.
- **No:** paginación o un límite configurable por el usuario en las tablas del home. Fuera de lo pedido; los límites quedan fijos en 7 y 6 como pidió el usuario.
- **Sí:** cargar "ACTIVIDAD EN VIVO" con `IntersectionObserver` a través de un endpoint propio (`app/api/home-activity/route.ts`) en vez de seguir pidiendo los datos en el servidor dentro de `app/page.tsx`. Decisión explícita del usuario: la sección vive muy abajo en el home y hoy pagaba su coste de Supabase en cada carga de `/`, la viera o no quien entra; diferirlo a quien de verdad hace scroll hasta ahí reduce el trabajo del primer render de la página más visitada del sitio.
- **No:** un RPC de Postgres que colapse `getGameBySlug` + `getLeaderboard` (y en `/jugar/[id]` también `getUserBestScore`) en una sola llamada de red. Se evaluó como la mejora de rendimiento más grande disponible para el bug 1, pero el usuario prefirió explícitamente quedarse con paralelizar + la query acotada por `game_id`: es menos invasivo, no añade una migración SQL nueva ni un patrón de acceso a datos distinto al resto de `lib/supabase/`, y es proporcional a que esta spec es un `Fix`. Queda anotado aquí para no repetir la evaluación si el rendimiento de esas dos páginas vuelve a ser un problema.
- **Sí:** el `IntersectionObserver` de `home-activity.tsx` se desconecta tras el primer disparo (no vuelve a pedir nada si la sección entra y sale repetidas veces del viewport). Los datos no cambian mientras el usuario sigue en la misma carga de página, así que pedirlos de nuevo sería desperdiciar la misma llamada que este spec está intentando evitar.
- **No:** reutilizar el hook `use-reveal.ts` para disparar también la carga de datos. Ese hook resuelve una animación de entrada (CSS) y ya tiene su propio contrato probado por los bloques "sin JavaScript"/"con prefers-reduced-motion"; mezclarle una responsabilidad de red distinta arriesga romper ese contrato por un acoplamiento que no hace falta — un `IntersectionObserver` propio y pequeño en el componente es más simple de razonar.

## Riesgos identificados

- `window.location.assign` para el invitado implica una recarga completa de página en vez de una transición de cliente — ligeramente más lenta que un `router.push` que funcione, pero solo en ese único flujo, y es la misma contrapartida que ya acepta `oauth()` hoy.
- Las capturas de referencia de `home-<proyecto>-darwin.png` casi seguro cambian de píxeles porque la sección "ACTIVIDAD EN VIVO" pasa de datos mock fijos a datos reales (vacíos tras un `db reset`, o con un récord real si el entorno de captura ya jugó alguno). Verificar a mano en navegador antes de regenerar, y regenerar solo el proyecto que realmente cambie, según la regla ya establecida en este repo para cambios visuales.
- Si una campaña de pruebas en paralelo guarda una puntuación real para un usuario semilla mientras otro test lee "TOP JUGADORES" esperando la tabla vacía, puede chocar con la misma condición de carrera entre tests documentada como riesgo conocido en SPEC 26. No se corrige aquí; si aparece, aislar el nuevo test de "actividad real" del resto con su propio usuario o con `test.describe.serial`.
- **Sin JavaScript, "ACTIVIDAD EN VIVO" nunca carga datos** — el `IntersectionObserver` que dispara el `fetch` no existe sin JS, así que la sección se queda en el esqueleto para siempre. Es la misma clase de degradación que ya acepta el resto del sitio (ver `use-reveal.ts`), y ningún test fija hoy un contenido concreto para esa sección sin JS — solo que las secciones `.reveal` no queden con `opacity` distinta de 1, lo que el esqueleto sigue cumpliendo.
- El `rootMargin` del `IntersectionObserver` es una estimación (margen de adelanto para que el `fetch` termine antes de que la sección quede del todo visible); en una conexión muy lenta el esqueleto puede verse brevemente antes de que lleguen los datos reales. Aceptable: es exactamente el mismo trueque que cualquier carga diferida, y no hay promesa de datos instantáneos en ningún otro punto del sitio.
