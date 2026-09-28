# SPEC 20 — BUSCAMINAS: cuarto motor jugable

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 04, SPEC 13, SPEC 14, SPEC 15, SPEC 16, SPEC 17, SPEC 18, SPEC 19
> **Fecha:** 2026-09-28
> **Objetivo:** Añadir `BUSCAMINAS` como cuarto juego del catálogo, con el buscaminas de `references/started-games/05-buscaminas/` portado a React — rejilla de 16 × 12 jugable por cursor **y por ratón** (clic primario revela, clic secundario marca bandera), con una progresión de nivel nueva (cada rejilla despejada sube el nivel y añade una mina) que la referencia no tiene —, encajado en el HUD y el registro `ENGINES` que ya sostienen a `TETRIX`, `ASTEROIDES` y `ARKANOID`, sin persistir nada más allá de lo que `save_score` ya hace solo.

---

## 1. Punto de partida

### 1.1 Lo que ya está resuelto y esta spec no toca

Cuarta spec de su familia: casi toda la carpintería existe y se reutiliza tal cual.

| Pieza existente                                                                                                    | Dónde                                                                                                                  | Papel aquí                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| HUD superior: Jugador · Puntuación · Vidas ♥ · Nivel                                                               | `.player-hud` / `.hud-stat` (`components/game-player.tsx:234-266`)                                                     | Se reutiliza **tal cual**. El motor solo empuja los tres números.                             |
| Botones `PAUSA` / `FIN` / `SALIR`                                                                                  | `.hud-actions`                                                                                                         | Únicos mandos de pausa; dentro de la pantalla no va ninguno.                                  |
| Overlay `EN PAUSA`                                                                                                 | `components/game-player.tsx:282-304`                                                                                   | Se reutiliza tal cual.                                                                        |
| Modal `FIN DEL JUEGO`, nombre no editable, bifurcación récord / invitado / cuenta, vuelta desde `/auth` por la URL | `components/game-player.tsx:327-390`, `app/jugar/[id]/page.tsx`                                                        | Se reutiliza entero.                                                                          |
| Contrato del motor                                                                                                 | `EngineProps` (`components/game-player.tsx:35-44`): `{ paused, onTogglePause, onRun, onOver, initialLives, maxLevel }` | `BuscaminasGame` expone **exactamente** el mismo.                                             |
| Remontaje al reiniciar con `runKey`                                                                                | `components/game-player.tsx:106, 218-230`                                                                              | Se reutiliza tal cual: `JUGAR DE NUEVO` solo cambia la `key`.                                 |
| Botón de pantalla completa (SPEC 19)                                                                               | `components/game-player.tsx:110-148, 306-319`                                                                          | Automático: no hay ni una línea de código nueva que escribir para esto.                       |
| Contador `plays` y guardado real (SPEC 18)                                                                         | `increment_game_plays` al montar, `save_score` en `GUARDAR PUNTUACIÓN`                                                 | Automático en cuanto la fila exista en `public.games` y el `slug` tenga entrada en `ENGINES`. |
| Marco CRT, scanlines, `.crt-bottom`                                                                                | `.crt` / `.crt-screen` (`app/globals.css:1205-1272`)                                                                   | El tablero vive **dentro** de `.crt-screen`.                                                  |

Lo único que cambia de estructura es que `ENGINES` (`components/game-player.tsx:52-59`) pasa de tres filas a cuatro — una fila más, no otra rama, tal y como fija `CLAUDE.md`.

### 1.2 Lo que trae la referencia

`references/started-games/05-buscaminas/game.js` (357 líneas, `'use strict'`, sin módulos) es un buscaminas completo sobre un único `<canvas>` de 576 × 432 (16 × 12 celdas de 36 px — **exactamente 4:3**, como `ARKANOID`). Sus números y reglas:

| Concepto                   | Valor en la referencia                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tablero                    | `COLS=16, ROWS=12, CELL=36` → canvas 576 × 432                                                                                                                                          |
| Minas                      | `MINES=28` fijo (≈14,6 % de densidad), colocadas con `Math.random()` sin semilla                                                                                                        |
| Primer clic seguro         | Las minas se colocan **después** del primer `reveal()`, excluyendo la celda pulsada y sus 8 vecinas                                                                                     |
| Revelado                   | Flood-fill iterativo con pila (`revealFlood`), expandiendo por celdas con `adjacent === 0`                                                                                              |
| Bandera                    | `toggleFlag`, tope de banderas en `MINES`, no afecta a celdas ya reveladas                                                                                                              |
| Puntuación                 | `SCORE_PER_CELL = 10`; cada `reveal()` suma `10 × celdas reveladas en esa cascada`                                                                                                      |
| Vidas                      | Ninguna: el primer error (revelar una mina) termina la partida al instante                                                                                                              |
| Niveles                    | Ninguno: una sola dificultad estática                                                                                                                                                   |
| Entrada                    | **Sin ratón.** Cursor por rejilla: flechas mueven (con repetición, 300 ms de retardo inicial y 70 ms de repetición), `Espacio` revela, `F` marca bandera                                |
| Sin ratón en la referencia | El propio autor lo deja escrito como decisión: cursor-first, cero listeners de `mouse`/`pointer` en `game.js`. Esta spec **añade** ratón como una segunda vía de entrada, no como port. |
| Táctil                     | Ya resuelto en `index.html`: cruceta + botones `F`/`ESPACIO` que escriben en el mismo estado de teclas que el teclado físico                                                            |
| Sonido                     | Ninguno                                                                                                                                                                                 |

Dos cosas de la referencia **no encajan** y se sustituyen (§6): su propio overlay de fin de partida dibujado en canvas (`drawOverlay`, con el `PUNTAJE` y el «ESPACIO PARA REINICIAR») — el modal `FIN DEL JUEGO` del proyecto ya cubre ese papel —, y la ausencia total de vidas/niveles, que esta spec introduce como diseño nuevo (no como port) a petición explícita: **una vida** (coincide con la propia frase del `README.md` de la referencia: «Solo tienes una vida») y **niveles reales**, cada rejilla despejada sube el nivel y añade una mina.

### 1.3 El contrato vivo (no la prosa de specs 13-15, que es de antes de la migración a Supabase)

- `components/game-player.tsx:52-59` — `ENGINES: Record<string, { Component: ComponentType<EngineProps>; screen: string }>`, hoy `tetrix`/`asteroides`/`arkanoid`.
- `lib/supabase/games.ts:13-33` — `Game` completo: `id, title, short, long, cat, cover, image, color, best, plays, dificultad, jugadores, perifericos, vidas, niveles`. `getGames()` (línea 86) ordena por `created_at`, no alfabético: un juego aditivo entra al final del array.
- `lib/tetris.ts:155` / `lib/arkanoid.ts:237` / `lib/asteroids.ts:216` — `createState(lives: number)` es la firma viva (TETRIX además recibe `maxLevel` porque es el único motor que topa su propio `level`; ASTEROIDES y ARKANOID ignoran `maxLevel` porque su progresión no tiene techo de nivel, solo topes internos — rocas por oleada, velocidad de la bola). BUSCAMINAS sigue el patrón de ASTEROIDES/ARKANOID: `createState(lives: number)`, sin `maxLevel`.
- `app/page.tsx:11` / `components/home/home-games.tsx:13-17` — **ya no recorta la lista** (el `GAMES.slice(0,6)` de las specs 13-15 no existe desde la migración a Supabase): pinta todos los juegos. `BUSCAMINAS` aparecerá solo en `/` sin tocar ese componente.
- `components/hall-of-fame.tsx:26` — pestaña por defecto `games[0].id`, sigue siendo `tetrix`; no cambia.
- `supabase/migrations/20260927082152_catalogo_juegos_y_puntuaciones.sql` y `20260927091451_catalogo_categorias_y_plays.sql` — esquema real de `games`/`categorias` (citado íntegro en §3.1). Las 3 filas sembradas son las 3 jugables: **no queda ninguna fila decorativa**, así que `BUSCAMINAS` es puramente aditivo.
- `public/juegos/` — solo `tetrix.png`, `asteroides.png`, `arkanoid.png`. Un juego puede lanzarse con `image: null` y su `cover` CSS de respaldo; ese camino ya está soportado por `components/game-card.tsx`/`components/home/mini-card.tsx`.

### 1.4 Efectos colaterales medidos del cuarto juego

| Qué cambia                           | Por qué                                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.mini-card` pasa de 3 a 4           | `tests/screens.spec.ts:246`. `home-games.tsx` pinta todos los juegos, sin recorte.                                                                                                                                                                                                                             |
| `.card` y `.cover-bg` pasan de 3 a 4 | `tests/screens.spec.ts:317-318` y `:367` (tras volver de la ficha).                                                                                                                                                                                                                                            |
| `.hall-tabs .chip` pasa de 3 a 4     | `tests/screens.spec.ts:1079`. `components/hall-of-fame.tsx` pinta un chip por juego.                                                                                                                                                                                                                           |
| Cuatro capturas de referencia        | `home-*` (por el `.mini-rail` con una tarjeta más) y `biblioteca-*` (una tarjeta más en la rejilla), en los dos proyectos. `salon-*` no entra en catálogo hasta que el juego tenga puntuaciones reales, pero el chip nuevo sí cambia el layout de la fila de pestañas: se revisa a mano si cambia visualmente. |
| Prosa desmentida                     | `README.md:9` («el catálogo son tres juegos») y la sección «Project» de `CLAUDE.md`.                                                                                                                                                                                                                           |

Y lo que, medido, **no** cambia:

| Qué no cambia                                                                  | Por qué                                                                                                                                |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| La pestaña por defecto de `/salon`                                             | `games[0].id` sigue siendo `tetrix`: `BUSCAMINAS` entra al final del array, ordenado por `created_at`.                                 |
| Las tablas de puntuaciones de los tres juegos existentes                       | `public.scores` no se toca; `BUSCAMINAS` estrena su propia fila en `games` y no tiene puntuaciones hasta que alguien juegue de verdad. |
| El chip `PUZZLE` gana una tarjeta, pero `ARCADE`/`SHOOTER`/`VERSUS` no cambian | Solo `arkanoid` (ARCADE) tenía compañía de categoría antes; ahora `tetrix` y `buscaminas` comparten `PUZZLE`.                          |
| `detalle-*`, `reproductor-*`, `auth-*`, `acerca-*`                             | Usan `serpentina`... en realidad `tetrix`/juegos existentes o no dependen del catálogo.                                                |

---

## 2. Alcance

**Dentro:**

- `lib/buscaminas.ts`: motor puro, sin `document`/`window`/`canvas`.
- `components/buscaminas-game.tsx`: `<canvas>`, bucle `requestAnimationFrame`, cursor por teclado con repetición, cruceta + `REVELAR` + `MARCAR` en pantalla, **y control por ratón**: clic primario revela la celda bajo el puntero, clic secundario marca bandera (con el menú contextual del navegador suprimido sobre el tablero).
- `components/game-player.tsx`: nueva fila `buscaminas` en `ENGINES`.
- Migración `supabase/migrations/<timestamp>_catalogo_buscaminas.sql`: fila nueva en `public.games`, sin cambios de esquema.
- Clase nueva `.cover-minas` en `app/globals.css`, dibujada en CSS puro (no hay ninguna huérfana que reciclar, a diferencia de los tres juegos anteriores).
- Clases `.minas-*` y el modificador `.crt-screen.minas`.
- Captura real en `public/juegos/buscaminas.png`, tomada con el juego ya jugable.
- Ajuste de los tres recuentos de `tests/screens.spec.ts` (§1.4) y un `describe("buscaminas")` nuevo sin captura del tablero.
- Extensión del test de paridad de HUD (`tests/screens.spec.ts:831-856`) para incluir `buscaminas`.
- `README.md` (prosa + índice de specs) y la sección «Project» de `CLAUDE.md`.

**Fuera:**

- **Persistir puntuaciones más allá de `save_score`.** Automático desde que existe la fila y la entrada en `ENGINES`; no hay nada que escribir para esto.
- **Sonido.** Decisión repetida en las tres specs anteriores; sigue sin haber ni una línea de audio en el proyecto.
- **Chord-click (revelar vecinas pulsando a la vez sobre un número ya descubierto), doble clic, clic central.** No se pidieron; el ratón aquí solo replica lo que ya hacen `Espacio`/`F` — revelar y marcar la celda señalada —, no añade atajos que el teclado no tiene.
- **Power-ups, comodines, deshacer una bandera puesta por error de forma especial, marcador de tiempo.** La referencia no los tiene y no se pidieron.
- **Dificultades seleccionables (principiante/intermedio/experto).** La referencia tiene una sola dificultad estática; la progresión de nivel de esta spec sustituye a esa idea, no la complementa.
- **Los otros tres juegos.** `TETRIX`, `ASTEROIDES` y `ARKANOID` quedan exactamente igual.
- **Cambios en el HUD.** Ni un bloque nuevo, ni un botón nuevo: común a los cuatro juegos.

---

## 3. Diseño

### 3.1 Catálogo (`public.games`)

No hace falta ningún cambio de esquema: `categoria_id`, `color`, `cover`, `image`, `short`, `long`, `dificultad`, `jugadores`, `perifericos`, `vidas`, `niveles` ya existen y están `not null` salvo `cover`/`image`. A diferencia de las migraciones de TETRIX/ASTEROIDES/ARKANOID (que insertaron primero y rellenaron cosmética después, porque esas columnas no existían todavía), aquí basta un único `insert`:

```sql
-- BUSCAMINAS: cuarto juego del catálogo, puramente aditivo — no hay ninguna
-- fila decorativa que sustituir ni columna nueva que añadir (SPEC 20).
insert into public.games (
  slug, nombre, niveles, vidas,
  categoria_id, color, cover, image, short, long,
  dificultad, jugadores, perifericos
) values (
  'buscaminas', 'BUSCAMINAS', null, 1,
  (select id from public.categorias where nombre = 'PUZZLE'),
  'green', 'cover-minas', '/juegos/buscaminas.png',
  'Descubre la rejilla sin detonar ninguna mina.',
  'Mueve el cursor por una rejilla de 16 por 12 casillas y revela terreno seguro. Los números marcan minas vecinas: márcalas con una bandera para no pisarlas. Cada rejilla despejada sube el nivel y añade una mina más — un solo error termina la partida.',
  2, 1, array['teclado', 'raton']
);
```

`niveles = null`: sin tope de nivel, como `ASTEROIDES`/`ARKANOID` — el freno real está en el número de minas (§3.2), no en el nivel. `vidas = 1`: un solo error termina toda la partida, a través de todos los niveles. `color = 'green'`: el único de los cuatro tokens base (`cyan`/`magenta`/`yellow`/`green`) que ningún juego usa todavía. `perifericos = array['teclado', 'raton']`: los dos periféricos son de verdad jugables, no solo el teclado (§6) — mismo patrón que `ARKANOID`, el único otro juego con `raton` en la fila. `plays` no se menciona: tiene `default 0`.

Por «Database first, code second» (`CLAUDE.md`), esta migración se empuja con `supabase db push` **antes** de fusionar a `main`; es aditiva y no rompe ningún código viejo.

### 3.2 El motor (`lib/buscaminas.ts`)

Módulo puro: sin `document`, sin `window`, sin canvas. Mismo motivo que en los otros tres.

```ts
export const COLS = 16;
export const ROWS = 12;
export const CELL = 36;
export const WIDTH = COLS * CELL; // 576
export const HEIGHT = ROWS * CELL; // 432
/** Una sola vida: el primer error termina toda la partida. */
export const LIVES = 1;
/** Nivel 1 empieza en 10 minas y sube de 1 en 1 hasta este tope. */
export const BASE_MINES = 10;
export const MINE_CAP = 60;

export type Cell = {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number; // 0-8, solo tiene sentido si !mine
};

export type Cursor = { row: number; col: number };

export type BuscaminasState = {
  board: Cell[][];
  cursor: Cursor;
  /** Minas de la rejilla actual; cambia en cada subida de nivel. */
  mines: number;
  flags: number;
  revealedCount: number;
  /** Las minas se colocan en el primer reveal(), no al crear el estado. */
  firstReveal: boolean;
  score: number;
  lives: number;
  level: number;
  /** true tras revelar una mina: el reproductor abre el modal. */
  over: boolean;
};

/** Minas de un nivel dado: 10 en el nivel 1, +1 por nivel, tope en 60. */
export function minesForLevel(level: number): number;

export function createState(lives: number): BuscaminasState;

/** Mueve el cursor dx/dy, saturado a los bordes de la rejilla. Sin efecto si over. */
export function moveCursor(
  state: BuscaminasState,
  dx: -1 | 0 | 1,
  dy: -1 | 0 | 1,
): void;

/**
 * Coloca el cursor directamente en (row, col), saturado a la rejilla. Es lo
 * que traduce la posición del puntero del ratón a una celda — el equivalente
 * de `setPaddleX` en `lib/arkanoid.ts`, pero para una rejilla en vez de un eje.
 * El teclado y el ratón comparten el mismo `state.cursor`: no hay una segunda
 * fuente de verdad sobre qué celda está señalada.
 */
export function setCursor(
  state: BuscaminasState,
  row: number,
  col: number,
): void;

/**
 * Revela la celda bajo el cursor. Primer reveal de cada rejilla: coloca las
 * minas excluyendo la celda y sus 8 vecinas. Mina → lives = 0, over = true.
 * Celda segura → flood-fill y `score += celdas × 10 × level`. Rejilla vacía
 * de no-minas → sube de nivel: nueva rejilla con más minas, cursor recentrado,
 * banderas y contador a cero; la vida y la puntuación no se tocan.
 */
export function reveal(state: BuscaminasState): void;

/** Alterna la bandera de la celda bajo el cursor. Tope: state.mines banderas. */
export function toggleFlag(state: BuscaminasState): void;
```

Reglas, calcadas de la referencia (§1.2) salvo donde se dice lo contrario:

- `minesForLevel(level) = Math.min(MINE_CAP, BASE_MINES - 1 + level)`: nivel 1 → 10, nivel 2 → 11, … nivel 51 → 60, y se queda en 60 de ahí en adelante (≈31 % de densidad, resoluble sin adivinar).
- Colocación de minas y flood-fill: idénticos a la referencia (`placeMines`/`revealFlood` citados en §1.2), solo que la cantidad de minas viene de `minesForLevel(state.level)` en vez de la constante `MINES=28`.
- Puntuación: `state.score += (celdas reveladas en la cascada) × 10 × state.level` — a diferencia de la referencia (`10` fijo) y de `ASTEROIDES` (que se quedó sin multiplicador por no tener niveles): aquí sí hay progresión real, así que el nivel multiplica, igual que en `TETRIX`/`ARKANOID`.
- Subida de nivel: al completarse `revealedCount === COLS × ROWS − state.mines`, `state.level++`, `state.mines = minesForLevel(state.level)`, tablero nuevo (`board` recreado, todas las celdas sin `mine`/`revealed`/`flagged`), `cursor` recentrado en `(row: 6, col: 8)`, `flags = 0`, `revealedCount = 0`, `firstReveal = true`. La vida y la puntuación acumulada **no** se reinician: es la misma partida, más difícil.
- Fin de partida: revelar una mina pone `lives = 0` y `over = true` en el mismo instante, sin distinción de tamaño de mina ni de nivel — igual de definitivo en el nivel 1 que en el nivel 40.
- `toggleFlag`: no afecta a celdas reveladas; tope en `state.mines` (el de la rejilla actual, no una constante fija).
- `reveal`/`toggleFlag` no distinguen de dónde vino el cursor: si un clic de ratón llamó primero a `setCursor(state, row, col)`, `reveal()`/`toggleFlag()` actúan sobre esa misma celda — exactamente el mismo camino que `Espacio`/`F` tras mover el cursor con las flechas. El ratón no es un segundo motor de reglas, es una segunda forma de mover el mismo cursor y disparar las mismas dos acciones.
- **Sin necesidad de sembrar el azar para los tests.** El primer `reveal()` de cada rejilla siempre libera al menos la celda pulsada (excluida de minas por diseño): la puntuación pasa a ser `> 0` de forma garantizada, sin depender de qué celda caiga. No hace falta copiar un LCG ni importar nada de `lib/scores.ts` — a diferencia de `ARKANOID`, que sí necesitaba determinismo para los muros generados, aquí ni siquiera hace falta.

### 3.3 El componente (`components/buscaminas-game.tsx`)

Cliente (`"use client"`). Contrato **idéntico** al de los otros tres:

```ts
export type BuscaminasRun = { score: number; lives: number; level: number };

type BuscaminasGameProps = {
  paused: boolean;
  onTogglePause: () => void;
  onRun: (run: BuscaminasRun) => void;
  onOver: () => void;
  initialLives: number;
  /** Ignorado: el nivel de BUSCAMINAS no tiene techo (games.niveles = null). */
  maxLevel: number | null;
};
```

Estructura interna, copiada deliberadamente del patrón de `components/tetris-game.tsx`:

1. **Estado en un `useRef`.** `stateRef.current ??= createState(initialLives)`, mutación in situ — no `useState` por fotograma.
2. **Bucle.** `requestAnimationFrame`; no hay gravedad ni caída automática (a diferencia de los otros tres), así que el bucle solo repinta y gestiona la repetición de tecla — no hay ningún `tick()` que avance el estado por sí solo. Se cancela en el `cleanup`, al pausar y al terminar.
3. **Aviso al HUD.** `publish()` compara `score`/`lives`/`level` con el último aviso y solo entonces llama a `onRun` — mismo patrón que los otros tres.
4. **Canvas.** Tamaño lógico `WIDTH × HEIGHT` (576 × 432), escalado por `devicePixelRatio`. Se pinta: rejilla, celdas ocultas/reveladas, números de adyacencia, banderas, resalte del cursor, y —solo cuando `over` y la celda era una mina— el tablero de minas completo, como hace `revealAllMines()` en la referencia.
5. **Teclado.** `ArrowUp/Down/Left/Right` mueven el cursor con repetición (300 ms de retardo inicial, 70 ms de repetición — se conserva el ritmo propio de la referencia, calibrado para desplazar un cursor por una rejilla, distinto del d-pad de piezas de `TETRIX` a 110 ms constante), `Espacio` revela (`preventDefault()`, o la página se desplaza), `F` marca bandera, `P` llama a `onTogglePause` — nunca estado local. Las cuatro flechas también llevan `preventDefault()`.
6. **Mandos táctiles.** Cruceta de 4 direcciones (mismo lenguaje visual que la de `TETRIX`/`ASTEROIDES`, `.btn`, `touch-action: manipulation`), más dos botones con rótulo propio, `REVELAR` y `MARCAR`. La cruceta repite mientras se mantiene pulsada, igual que el teclado; `REVELAR`/`MARCAR` son de un solo disparo por pulsación.
7. **Ratón, sobre el propio `<canvas>`.** `onPointerMove` convierte `clientX`/`clientY` a fila/columna con `getBoundingClientRect()` y el tamaño lógico de la celda —misma técnica que `setPaddleX` en `components/arkanoid-game.tsx`— y llama a `setCursor()`: el cursor visual sigue al puntero. `onPointerDown` con `e.button === 0` (primario) llama a `reveal()`; con `e.button === 2` (secundario) llama a `toggleFlag()`. Un listener de `contextmenu` sobre el canvas llama a `e.preventDefault()`, o el navegador abriría su menú contextual en cada clic derecho en vez de marcar una bandera. No hace falta `touch-action: none`: no hay arrastre que proteger, un tap normal ya dispara `pointerdown` con `button === 0`.
8. **Colores leídos del CSS una sola vez al montar**, con `getComputedStyle`, y un array de hex literales de respaldo — mismo patrón que `PIECE_FALLBACK` en `tetris-game.tsx:38`.
9. **Reinicio.** No hay lógica de reinicio dentro: `JUGAR DE NUEVO` cambia `runKey` en el reproductor y React remonta el componente con `createState(initialLives)` de cero.

Dentro del canvas no se dibuja ni puntuación, ni vidas, ni nivel — regla no negociable de las tres specs anteriores, sin excepción aquí tampoco.

### 3.4 Reparto dentro de `.crt-screen`

El tablero (576 × 432) es exactamente 4:3, como el de `ARKANOID`, pero el cursor puede estar en **cualquier** celda de la rejilla, incluida la última fila — el mismo problema que obligó a `ARKANOID` a sacar sus mandos del tablero (SPEC 15 §8). La solución elegida aquí es la de `ASTEROIDES`: columna lateral en escritorio, apilado en móvil.

```
┌─ .crt-screen.minas ────────────────────────┐
│ ┌──────────────┐                            │
│ │              │   MOVIMIENTO                │
│ │              │      [↑]                    │
│ │  rejilla     │   [←][↓][→]                 │
│ │  16 × 12     │                              │
│ │              │   REVELAR                    │
│ │              │   [   ␣   ]                  │
│ │              │   MARCAR                     │
│ └──────────────┘   [   F   ]                  │
└──────────────────────────────────────────────┘
```

Clases nuevas en `app/globals.css`, en un bloque hermano de `.tetris-*`/`.rocks-*`/`.ark-*`: `.minas-stage` (mismo `position: absolute; inset: 0; display: flex; gap: clamp(8px, 2%, 20px); padding: clamp(8px, 2%, 18px);` que `.rocks-stage`, con el fondo `radial-gradient` compartido de `.tetris-stage`), `.minas-board` (`width: auto; height: auto; max-width: 100%; max-height: 100%; cursor: pointer;` — mismo patrón de `.rocks-field`, que deja mandar al lado que se quede corto, más el cursor de puntero que señala que el tablero también se juega con el ratón), `.minas-side` (`width: clamp(84px, 22%, 180px); align-self: stretch;`), `.minas-block`, `.minas-side .l` (título en `var(--pixel)` 8px, igual que `.tetris-side .l`/`.rocks-side .l`), `.minas-pad` (cruceta en rejilla de 3 columnas, mismo patrón que `.rocks-pad`), y `.minas-side .pad-reveal`/`.pad-flag` a ancho completo, como el `pad-fire` de `ASTEROIDES`.

Aritmética a 1440 px (idéntica a la de `ASTEROIDES`, mismo caso: campo 4:3 nativo dentro de una pantalla 4:3 con columna lateral): `.crt-screen` mide 1004 × 753, la columna se lleva hasta 180 px, y al campo le quedan 768 px de ancho — por debajo de los 717 px de alto disponibles a 4:3 real, así que manda el ancho: el tablero se dibuja a 768 × 576.

A 390 px la columna fija dejaría el campo en 202 × 151 (celdas de ~12,6 px, por debajo del umbral jugable que `TETRIX` ya midió que falla). Por eso, igual que `ASTEROIDES`, `.crt-screen.minas` en `@media (max-width: 720px)` pasa de `aspect-ratio: 4 / 3` a `3 / 4`: la pantalla pasa a 310 × 413, el campo se apila arriba a 294 × 220 (celdas de 18,375 px — cuadradas, jugables con el dedo) y los mandos bajan a una fila con la cruceta a la izquierda, `REVELAR` y `MARCAR` a la derecha, en los ~169 px que quedan de alto.

### 3.5 Colores

Ningún token nuevo. Los 8 colores de adyacencia (1-8, un mismo número de vecinos por celda) reutilizan **exactamente** los 8 tokens neón/mezcla que ya existen en `:root` — no sobra ni falta ni uno:

```
1 → var(--cyan)     5 → var(--piece-z)  (ámbar)
2 → var(--green)    6 → var(--piece-j)  (violeta)
3 → var(--magenta)  7 → var(--piece-l)  (azul eléctrico)
4 → var(--silver)   8 → var(--yellow)
```

El cursor y la bandera reutilizan `var(--green)` (el color de catálogo del juego) y `var(--magenta)`, respectivamente. La celda oculta y la celda revelada quedan en un gris casi negro sin tokenizar (mismo criterio que los literales `#0a0030`/`#000` del fondo de `.tetris-stage`: no son parte de la familia `--piece-*`/`--rock-*`/`--brick-*`, son fondo del escenario). El icono de mina reutiliza `var(--ink)`/`var(--ink-faint)`. Cero hex nuevos en `:root`.

### 3.6 Cobertura del catálogo (`.cover-minas`)

A diferencia de `TETRIX`/`ASTEROIDES`/`ARKANOID`, que heredaron una clase `cover-*` huérfana de un juego decorativo anterior, `BUSCAMINAS` es puramente aditivo: no hay ninguna que reciclar. `.cover-minas` se dibuja desde cero en `app/globals.css`, junto a las otras tres, con el mismo lenguaje visual (gradiente de fondo + un `::after`/`::before` con formas geométricas) — una rejilla tenue con un par de celdas marcadas y un icono de mina, en la paleta de `--green`/`--ink-faint`. Sirve de respaldo mientras `image` sea `null` y, en el propio `/biblioteca`, se sustituye por `cover-shot` en cuanto exista `public/juegos/buscaminas.png`.

### 3.7 `ENGINES` (`components/game-player.tsx`)

Una fila más, no otra rama:

```ts
const ENGINES: Record<
  string,
  { Component: ComponentType<EngineProps>; screen: string }
> = {
  tetrix: { Component: TetrisGame, screen: "tetris" },
  asteroides: { Component: AsteroidsGame, screen: "rocks" },
  arkanoid: { Component: ArkanoidGame, screen: "" },
  buscaminas: { Component: BuscaminasGame, screen: "minas" },
};
```

Nada más cambia en `game-player.tsx`: el HUD, el modal, `runKey`, `ignoreRun`, el botón de pantalla completa y el flujo de `save_score`/`increment_game_plays` ya son genéricos sobre `game.id`.

### 3.8 Tests

**Arreglos obligados** (§1.4), en `tests/screens.spec.ts`:

| Línea    | Cambio                                                    |
| -------- | --------------------------------------------------------- |
| 246      | `.mini-card` `toHaveCount(3)` → `toHaveCount(4)`          |
| 317, 318 | `.card` / `.cover-bg` `toHaveCount(3)` → `toHaveCount(4)` |
| 367      | `.card` `toHaveCount(3)` → `toHaveCount(4)`               |
| 1079     | `.hall-tabs .chip` `toHaveCount(3)` → `toHaveCount(4)`    |

**`describe("buscaminas")` nuevo**, con el patrón exacto de `describe("arkanoid")` (`tests/screens.spec.ts:758-856`): reloj **vivo** (aunque aquí no hay `requestAnimationFrame` avanzando el estado por sí solo, el bucle de repintado sigue vivo), sin captura del tablero (aleatorio):

1. **Arranque.** En `/jugar/buscaminas`: `.minas-board` visible, HUD con `Puntuación 0`, **un** `♥` y `Nivel 01`; `.crt-screen .minas-pad .btn` cuenta 4 (cruceta), `REVELAR` y `MARCAR` visibles por su `aria-label`, y dentro de `.crt-screen` no hay ningún botón de pausa.
2. **Revelar puntúa y no desplaza la página.** `Espacio` sube la puntuación del HUD por encima de 0 (el primer reveal siempre libera al menos una celda, así que el signo no depende de la suerte) y `window.scrollY` no cambia.
3. **El clic primario revela.** Un clic sobre una celda del `.minas-board` sube la puntuación del HUD por encima de 0, igual que `Espacio` — mismo argumento de determinismo: la primera celda pulsada nunca es una mina.
4. **El clic secundario marca bandera sin abrir el menú contextual.** Un clic derecho sobre una celda sin revelar no cambia la puntuación, y `page.evaluate` no detecta ningún `contextmenu` sin `defaultPrevented`.
5. **PAUSA congela la partida.** Igual que en los otros tres: `EN PAUSA` visible, la puntuación no se mueve durante un segundo, `REANUDAR` la quita.

**Extensión del test de paridad de HUD** (`tests/screens.spec.ts:831-856`): se añade `buscaminas` a la comparación, de forma que las etiquetas de `.player-hud .hud-stat .l` y los botones de `.hud-actions .btn` de los cuatro juegos sean idénticos entre sí, no solo entre `arkanoid` y `tetrix`.

### 3.9 Documentación

- `README.md:9` — «El catálogo son tres juegos, los tres reales» pasa a «cuatro juegos», con una frase sobre `BUSCAMINAS`: rejilla de 16 × 12 por cursor o por ratón (clic primario revela, secundario marca bandera), progresión de nivel que sube el número de minas, y una vida.
- `README.md` — fila nueva en el índice de specs, y el árbol de ficheros suma `lib/buscaminas.ts` y `components/buscaminas-game.tsx`.
- Sección «Project» de `CLAUDE.md` — el párrafo de los tres motores gana un cuarto, con la misma densidad que los otros tres (reglas propias + las que comparte con el resto).

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y la suite en un estado conocido.

1. **Migración.** `supabase/migrations/<timestamp>_catalogo_buscaminas.sql` según §3.1. _Comprobación:_ `npx supabase db reset`, `/juego/buscaminas` responde 200, el chip `PUZZLE` de `/biblioteca` pasa a dos tarjetas (`TETRIX` + `BUSCAMINAS`), y `/salon` sigue abriendo en `TETRIX`. La suite está roja en los cuatro recuentos de §3.8: se arregla en el paso 6.
2. **Motor.** `lib/buscaminas.ts` completo (§3.2), sin consumidor todavía. _Comprobación:_ `npx tsc --noEmit` limpio; en la consola del navegador, `createState(1).mines` es `10`, `minesForLevel(51)` es `60` y `minesForLevel(999)` sigue siendo `60`, `reveal()` sobre el estado recién creado dispara `firstReveal = false` y `score > 0`, y una rejilla artificialmente completa sube `level` a 2 con `mines = 11` y `score`/`lives` intactos.
3. **Tokens y CSS.** `.cover-minas` (§3.6) y las clases `.minas-*` más el modificador `.crt-screen.minas` (§3.4) — sin tokens de color nuevos, solo reutilización (§3.5). _Comprobación:_ los otros tres juegos siguen exactamente igual a 1440 px y a 390 px.
4. **Componente.** `components/buscaminas-game.tsx` (§3.3). _Comprobación a mano en el navegador:_ el cursor se mueve con las flechas y repite al mantener pulsado, `Espacio` revela y `F` marca, el flood-fill se expande correctamente, revelar una mina termina la partida y descubre el resto del tablero, limpiar una rejilla sube de nivel con una rejilla nueva y una mina más, la cruceta más `REVELAR`/`MARCAR` responden con el dedo y con el ratón, y sobre el propio tablero el clic izquierdo revela la celda bajo el puntero, el clic derecho la marca con bandera sin abrir el menú contextual del navegador, y mover el ratón sobre la rejilla mueve el resalte del cursor.
5. **Reproductor.** La fila `buscaminas` en `ENGINES` (§3.7). _Comprobación:_ en `/jugar/buscaminas` el HUD sube con el juego, arranca con un corazón y `Nivel 01`, `PAUSA` congela, `P` hace lo mismo que el botón, `FIN` abre el modal y el juego se detiene detrás, `JUGAR DE NUEVO` devuelve rejilla nueva, `0` puntos, `Nivel 01` y un corazón. Los otros tres juegos no han cambiado.
6. **Tests.** Los cuatro arreglos y el `describe("buscaminas")` de §3.8, más la extensión del test de paridad de HUD. _Comprobación:_ `npm test` solo falla en las capturas de referencia afectadas, por diferencia de imagen.
7. **Capturas.** Verificado a mano `/` y `/biblioteca` en los dos anchos (y `/salon` si el chip nuevo mueve el layout), `npx playwright test --update-snapshots`. Revisar el diff: solo `home-*` y `biblioteca-*` (y, si aplica, `salon-*`) en los dos proyectos. Si aparece `detalle-*`, `reproductor-*` o `auth-*`, algo se ha filtrado y se para aquí.
8. **Captura del juego.** `public/juegos/buscaminas.png`, con el `image` de la fila actualizado si hiciera falta una migración adicional (o incluido ya en el paso 1 si la captura existe antes de fusionar).
9. **Documentación y cierre.** `README.md` y `CLAUDE.md` según §3.9. _Verificación final:_ `npm test` verde, `npx tsc --noEmit` y `npm run lint` limpios.

---

## 5. Criterios de aceptación

- [ ] `public.games` gana una fila `buscaminas` sin tocar el esquema existente; la migración es aditiva y se empuja con `supabase db push` antes de fusionar a `main`.
- [ ] `/juego/buscaminas` y `/jugar/buscaminas` responden 200.
- [ ] `/biblioteca` muestra cuatro tarjetas; el chip `PUZZLE` muestra `TETRIX` y `BUSCAMINAS`.
- [ ] `/` sigue pintando su `.mini-rail` sin recorte, ahora con cuatro tarjetas.
- [ ] `/salon` sigue abriendo en la pestaña `TETRIX` y muestra cuatro chips.
- [ ] En `/jugar/buscaminas` las flechas mueven el cursor por la rejilla, con repetición al mantener pulsado, saturado a los bordes.
- [ ] `Espacio` revela la celda bajo el cursor y no desplaza la página.
- [ ] `F` alterna la bandera de la celda bajo el cursor, sin efecto sobre una celda ya revelada.
- [ ] Un clic primario (izquierdo) sobre una celda del tablero la revela, igual que `Espacio` tras mover el cursor ahí.
- [ ] Un clic secundario (derecho) sobre una celda sin revelar la marca con una bandera, sin revelarla y sin abrir el menú contextual del navegador.
- [ ] Mover el ratón sobre el tablero mueve el resalte del cursor a la celda bajo el puntero, compartiendo el mismo `state.cursor` que el teclado.
- [ ] `public.games.perifericos` de `buscaminas` es `['teclado', 'raton']`.
- [ ] El primer `Espacio` de cada partida no puede tocar una mina: la celda pulsada y sus 8 vecinas quedan siempre libres de minas.
- [ ] Revelar una celda vacía dispara el flood-fill y descubre todas las celdas conectadas con cero minas vecinas.
- [ ] La puntuación sube en `10 × nivel` por cada celda revelada en una cascada.
- [ ] Revelar una mina pone las vidas del HUD a `—`, revela el resto de minas en el tablero y abre el modal `FIN DEL JUEGO` con la puntuación acumulada.
- [ ] Completar una rejilla (todas las celdas sin mina reveladas) sube el `Nivel` del HUD, genera una rejilla nueva con una mina más que la anterior, recentra el cursor y pone las banderas a cero — sin tocar la puntuación ni las vidas.
- [ ] El número de minas de una rejilla es `min(60, 9 + nivel)`: 10 en el nivel 1, 11 en el nivel 2, … y se queda fijo en 60 a partir del nivel 51.
- [ ] El tope de banderas de cada rejilla es igual al número de minas de esa rejilla, no una constante fija.
- [ ] El HUD arranca con **un** corazón y `Nivel 01`.
- [ ] Dentro del canvas no se dibuja ni puntuación, ni vidas, ni nivel.
- [ ] Los ocho colores de adyacencia (1-8) son los ocho tokens neón/mezcla ya existentes en `:root`, sin ningún hex nuevo.
- [ ] Dentro de la pantalla hay cuatro botones de movimiento más `REVELAR` y `MARCAR`, con sus rótulos `MOVIMIENTO`, `REVELAR` y `MARCAR`.
- [ ] Dentro de la pantalla CRT no hay ningún botón de pausa.
- [ ] `PAUSA` (botón del HUD) y `P` (teclado) alternan el mismo estado; con la pausa activa la puntuación no cambia.
- [ ] `FIN` abre el modal y detiene el bucle; no queda ningún `requestAnimationFrame` vivo detrás del modal.
- [ ] `JUGAR DE NUEVO` devuelve una rejilla nueva de nivel 1 (10 minas), `0` puntos y un corazón.
- [ ] `GUARDAR PUNTUACIÓN` guarda de verdad cuando la partida es récord del jugador (vía `save_score`), igual que en los otros tres juegos; con sesión de invitado el modal pide iniciar sesión y lleva a `/auth` con la puntuación y el nivel en la URL.
- [ ] El HUD superior de `/jugar/buscaminas` es idéntico (mismas cuatro etiquetas, mismos tres botones) al de `/jugar/tetrix`, `/jugar/asteroides` y `/jugar/arkanoid`.
- [ ] A 1440 px la rejilla se dibuja a 768 × 576, con la columna de mandos a su derecha, sin tapar nunca una celda.
- [ ] A 390 px de ancho el escenario se apila, `.crt-screen.minas` pasa a `aspect-ratio: 3 / 4`, las celdas miden al menos 18 px y los botones de la cruceta y de `REVELAR`/`MARCAR` miden al menos 44 px de alto.
- [ ] La portada de `BUSCAMINAS` usa `.cover-minas` mientras no haya captura real, y `cover-shot` en cuanto exista `public/juegos/buscaminas.png`.
- [ ] `TETRIX`, `ASTEROIDES` y `ARKANOID` se comportan y se ven exactamente igual que antes de esta spec.
- [ ] `lib/buscaminas.ts` no referencia `document`, `window` ni `canvas`.
- [ ] `lib/buscaminas.ts` no importa nada de `lib/scores.ts` ni siembra ningún generador de números aleatorios propio: no hace falta para el determinismo de los tests.
- [ ] De las capturas de referencia afectadas se regeneran exactamente las de `home` y `biblioteca` en los dos proyectos (más `salon` si el chip nuevo cambia visualmente su fila); `detalle-*`, `reproductor-*`, `auth-*` y `acerca-*` quedan intactas.
- [ ] `npm test` verde; `npx tsc --noEmit` y `npm run lint` limpios.
- [ ] `package.json` no tiene dependencias nuevas; no hay variables de entorno nuevas.
- [ ] `lib/tetris.ts`, `lib/asteroids.ts`, `lib/arkanoid.ts`, `components/tetris-game.tsx`, `components/asteroids-game.tsx`, `components/arkanoid-game.tsx`, el HUD y el modal de `components/game-player.tsx` (más allá de la fila de `ENGINES`) quedan sin tocar.

---

## 6. Decisiones

- **Sí:** cuarto juego puramente aditivo, al final del array. No queda ninguna fila decorativa que sustituir (SPEC 17 ya las borró todas) y `getGames()` ordena por `created_at`, así que entra al final sin desplazar nada.
- **Sí:** `BUSCAMINAS` en mayúsculas, id `buscaminas`. Sigue la convención en español del resto del catálogo (`TETRIX`, `ASTEROIDES`; `ARKANOID` es la única excepción explícita, ya anotada en SPEC 15).
- **Sí:** una vida, coincidiendo con la propia frase de la referencia («Solo tienes una vida»). Un buscaminas con vidas de sobra dejaría de ser buscaminas: el error tiene que costar la partida.
- **Sí:** progresión de nivel nueva —cada rejilla despejada sube el nivel y añade una mina— aunque la referencia no la tenga. Pedido explícito: sin ella, `BUSCAMINAS` sería el único de los cuatro motores sin ninguna noción de nivel, y el bloque `Nivel` del HUD se quedaría clavado en `01` para siempre, que es precisamente lo que `CLAUDE.md` pide evitar (el HUD pinta lo que hay, no una mentira fija).
- **Sí:** `games.niveles = null` (sin tope de nivel). El freno real de la dificultad es el número de minas, no el nivel; forzar un tope de nivel sería inventar un final que el juego no necesita, igual que `ASTEROIDES`/`ARKANOID` dejan el nivel sin techo y topan su propio mecanismo interno.
- **Sí:** `minesForLevel(level) = min(60, 9 + level)`. 60 minas sobre 192 celdas es ≈31 % de densidad, resoluble sin adivinar (compárese con el clásico "experto" de Windows, ≈20 %, pero aquí el flood-fill de la zona segura ayuda más al empezar cada rejilla). El tope llega en el nivel 51: progresión larga antes de estabilizarse.
- **No:** dejar la densidad de minas sin techo. Por encima de cierto punto el flood-fill deja de abrir huecos y cada partida se convierte en adivinar, no en razonar — el género deja de ser el que es.
- **Sí:** `10 × nivel` por celda revelada, a diferencia de la referencia (`10` fijo) y de `ASTEROIDES` (sin multiplicador). Aquí sí hay progresión real de nivel, así que la puntuación debe premiar llegar lejos y no solo revelar celdas, igual que `TETRIX`/`ARKANOID`.
- **No:** puntuación fija como la referencia. Dejaría el marcador plano por encima de cierto nivel y el nivel 40 valdría lo mismo que el 2, exactamente el problema que `ARKANOID` ya evitó con su propio multiplicador.
- **Sí:** cursor por teclado como base, heredado de la propia referencia — no una limitación impuesta por este proyecto. La referencia es deliberadamente cursor-first y sin ratón.
- **Sí:** añadir ratón como segunda vía de entrada, pedido explícito del usuario. A diferencia de `ARKANOID` (que arrastra la pala por un eje), aquí el ratón no inventa un gesto nuevo: solo traduce la posición del puntero a una celda de la misma rejilla que ya recorre el cursor, y dispara las mismas dos acciones (`reveal`/`toggleFlag`) que `Espacio`/`F`. Es además la convención universal del género — el propio buscaminas de Windows es clic izquierdo revela / clic derecho marca —, así que no es una mecánica nueva, es la que la referencia decidió no traer.
- **Sí:** clic primario revela, clic secundario marca bandera. Es el mapeo que pidió el usuario y coincide exactamente con la convención del género; no hay ambigüedad que resolver.
- **No:** sustituir el cursor por teclado por el ratón. Los mandos táctiles (`REVELAR`/`MARCAR`) y el teclado siguen siendo necesarios en pantallas sin ratón de verdad (móvil, o un usuario que prefiere no soltar las manos del teclado); el ratón se añade, no reemplaza nada.
- **No:** chord-click, doble clic o clic central para revelar vecinas de golpe. No se pidió, y el teclado tampoco tiene un atajo equivalente — el ratón replica exactamente lo que `Espacio`/`F` ya hacen, ni más ni menos.
- **Sí:** repetición de tecla a 300 ms / 70 ms, calibrada por la propia referencia para mover un cursor por una rejilla — distinta del ritmo de 110 ms constante de la cruceta de piezas de `TETRIX`, que mueve una pieza que cae, no un cursor.
- **No:** igualar el ritmo de repetición al de `TETRIX` "por consistencia". Son dos gestos distintos (mover una pieza que cae vs. pasear un cursor por una rejilla estática) y forzar el mismo número no los hace más parecidos, solo peor calibrados.
- **Sí:** columna lateral en escritorio, apilado en móvil — el mismo patrón de `ASTEROIDES`, no el de `ARKANOID`. El cursor de `BUSCAMINAS` puede estar en cualquier celda, incluida la última fila, así que superponer mandos sobre el tablero (como intentó primero `ARKANOID`) repetiría el mismo problema que esa spec ya tuvo que corregir.
- **No:** mandos superpuestos sobre el tablero. Es justo el error que `ARKANOID` cometió y corrigió en su §8; no hay motivo para repetirlo a sabiendas.
- **Sí:** `.crt-screen.minas` cambia a `3 / 4` por debajo de 720px, igual que `.crt-screen.rocks`. A 390 px con columna fija el campo queda en ~12,6 px por celda, por debajo del umbral que `TETRIX` ya demostró que no se juega.
- **Sí:** ocho colores de adyacencia = los ocho tokens neón/mezcla ya existentes, sin ningún hex nuevo. Encaja exacto (8 necesarios, 8 disponibles) y es la opción más alineada con lo que las tres specs anteriores ya vienen defendiendo: no inventar color si la paleta ya lo tiene.
- **No:** paleta de números independiente inventada para este juego. Sería la primera vez que un motor no reutiliza la familia de tokens existente, sin ninguna razón visual que lo justifique.
- **Sí:** `.cover-minas` dibujada desde cero en CSS. No hay ninguna clase huérfana que reciclar (a diferencia de los tres juegos anteriores) y el patrón de "captura real + respaldo en CSS" ya está establecido.
- **No:** lanzar `BUSCAMINAS` solo con `image: null` y sin `.cover-minas` propia. El respaldo CSS es lo que evita una tarjeta rota mientras no exista la captura; los otros tres juegos siempre tuvieron uno.
- **Sí:** `dificultad: 2`. Sin presión de tiempo ni reflejos que fallar: el reto es puramente lógico. Es, con diferencia, el más bajo de los cuatro (`ARKANOID` 3, `TETRIX` 4, `ASTEROIDES` 5), y eso es correcto: no hay nada que se mueva solo.
- **Sí:** `jugadores: 1`, `perifericos: ['teclado', 'raton']`. Los dos periféricos son de verdad jugables ahora (ninguno es de relleno), y sin ningún mecanismo de dos jugadores en la referencia. Mismo patrón que `ARKANOID`, el único otro juego con `raton` en la fila.
- **No:** sembrar el azar de la colocación de minas para tests deterministas. A diferencia de `ARKANOID` (que sí necesitaba muros reproducibles), aquí el primer `reveal()` siempre libera al menos una celda por construcción — la puntuación es `> 0` garantizado sin importar qué caiga, así que no hay nada que determinismo resolviera.
- **No:** overlay de fin de partida propio (el `drawOverlay` de la referencia). El modal `FIN DEL JUEGO` del proyecto ya cubre exactamente ese papel, con el estilo de la casa.
- **No:** dificultades seleccionables (principiante/intermedio/experto). La referencia tiene una sola dificultad estática y esta spec ya sustituye esa idea por una progresión de nivel; añadir selector de dificultad encima sería una mecánica nueva no pedida.
- **No:** persistir nada más allá de `save_score`. Automático en cuanto la fila y la entrada de `ENGINES` existen; no hay nada que escribir para esto, igual que en las tres specs anteriores.

---

## 7. Riesgos

| Riesgo                                                                                                                                                                                                       | Mitigación                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Con minas cerca del tope (60 sobre 192) el flood-fill inicial libera muy poco y la partida se siente injusta                                                                                                 | La zona segura del primer clic (celda + 8 vecinas) sigue aplicándose en cada nivel, y el tope se alcanza en el nivel 51 tras una progresión larga; si en juego real resulta duro, el ajuste es `MINE_CAP`, una sola constante. |
| El cursor recentrado tras subir de nivel puede caer sobre una zona con muchas minas alrededor, endureciendo el primer clic de la rejilla nueva                                                               | La zona segura excluye siempre la celda del cursor y sus 8 vecinas en el momento de colocar las minas, sea cual sea la posición: la garantía no depende de dónde esté el cursor.                                               |
| Repetición de tecla a 300/70 ms puede sentirse lenta comparada con la cruceta de 110 ms de `TETRIX`                                                                                                          | Es el ritmo propio de la referencia, calibrado para un cursor de rejilla; si en la revisión manual se siente mal, es una constante en el componente, no un cambio de arquitectura.                                             |
| El escenario apilado en móvil dejó al `ARKANOID` original con mandos tapando la pala; el mismo patrón (columna en escritorio, apilado en móvil) podría repetir un solape distinto aquí                       | Se verifica a mano a 390 px y 1440 px antes de cerrar el paso 4 del plan, igual que exige `CLAUDE.md` para cualquier cambio visual; el modificador `.crt-screen.minas` es el mismo ya probado en `ASTEROIDES`.                 |
| Revelar el tablero completo de minas al perder (`revealAllMines`) en una rejilla de nivel alto (60 minas) puede ser costoso de pintar cada fotograma mientras el modal está abierto encima                   | El bucle se cancela en la transición a `over` (mismo patrón que los otros tres): no hay repintado de fondo detrás del modal.                                                                                                   |
| Las capturas regeneradas de `home`/`biblioteca` (y `salon` si aplica) consagran una regresión visual                                                                                                         | Se revisan a mano en los dos anchos antes de regenerar, y el diff queda acotado a esos ficheros — regla de `CLAUDE.md`.                                                                                                        |
| Un quinto juego futuro vuelve a romper los recuentos de la suite                                                                                                                                             | §1.4 deja escrito qué deriva del array y qué no; no se añade abstracción para evitarlo, es una tabla de datos de cuatro filas.                                                                                                 |
| El clic derecho abre el menú contextual del navegador encima del tablero en vez de marcar una bandera                                                                                                        | Listener de `contextmenu` en el `<canvas>` con `e.preventDefault()`; criterio de aceptación propio que lo comprueba explícitamente en el test del clic secundario.                                                             |
| En una pantalla táctil, un tap sobre el tablero dispara `pointerdown` con `button === 0` igual que un clic izquierdo, pero un mantener-pulsado del sistema operativo podría intentar simular un clic derecho | Los mandos táctiles (`REVELAR`/`MARCAR`) siguen siendo el camino recomendado en móvil — el ratón es una capa añadida para escritorio, no un reemplazo; no se pidió gesto de mantener-pulsado y no se implementa ninguno.       |
