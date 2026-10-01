# SPEC 25 — SERPIENTE: quinto motor jugable

> **Estado:** Aprobado
> **Depende de:** SPEC 01, SPEC 04, SPEC 13, SPEC 14, SPEC 15, SPEC 16, SPEC 17, SPEC 18, SPEC 19, SPEC 20, SPEC 21, SPEC 22, SPEC 23
> **Fecha:** 2026-10-01
> **Objetivo:** Añadir `SERPIENTE` como quinto juego del catálogo, con el snake de `references/started-games/06-serpiente/` portado a React — rejilla de 20 × 15 recorrida por una serpiente que nunca se detiene, con los giros **encolados** (nunca sobrescritos) para que dos pulsaciones dentro del mismo paso no la hagan morderse el cuello, que espera quieta al primer giro antes de arrancar —el `serving` de ARKANOID aplicado a un snake—, nivel sin techo que acorta el paso y una sola vida —, encajado en el HUD común, el mando de móvil y el registro `ENGINES` que ya sostienen a los cuatro motores existentes, sin persistir nada más allá de lo que `save_score` ya hace solo.

---

## 1. Punto de partida

### 1.1 Lo que ya está resuelto y esta spec no toca

Quinta spec de su familia: la carpintería está entera y se reutiliza tal cual. Esta es la primera spec de juego posterior a SPEC 21/22/23, así que lo que hereda es **más** que lo que heredó `BUSCAMINAS`.

| Pieza existente                                                                  | Dónde                                                              | Papel aquí                                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| HUD superior: Jugador · Puntuación · Vidas ♥ · Nivel                             | `.player-hud` / `.hud-stat` (`components/game-player.tsx:379-399`) | Se reutiliza **tal cual**. El motor sólo empuja los tres números por `onRun`.                 |
| Fila de acciones `PAUSA` / `MENÚ` / `⛶`                                          | `.hud-actions` (`components/game-player.tsx:402-437`)              | Cambia con el viewport, nunca con el juego. Dentro del tubo no va ningún control de pausa.    |
| Cartel `EN PAUSA`                                                                | `components/game-player.tsx:552-574`                               | Se reutiliza tal cual.                                                                        |
| Panel dentro del tubo (`.crt-menu`), dos estados `menu`/`over`, rama de guardado | `components/game-player.tsx:488-551` (SPEC 22)                     | Se reutiliza entero. No hay `CONTINUAR` y `MENÚ` es un interruptor.                           |
| Contrato del motor                                                               | `EngineProps` (`components/game-player.tsx:66-77`)                 | `SerpienteGame` expone **exactamente** el mismo, `padRef` incluido.                           |
| Remontaje al reiniciar con `runKey`                                              | `components/game-player.tsx:191, 362-375, 454`                     | Se reutiliza tal cual: `REINICIAR` sólo cambia la `key`.                                      |
| Mando de consola en móvil                                                        | `components/game-pad.tsx` + `ENGINES.pad` (SPEC 21)                | Automático: basta declarar el `PadLayout` en la fila nueva de `ENGINES`.                      |
| Las cuatro bandas del tubo: señal, leyenda, juego, marcador                      | `components/game-player.tsx:449-482` + `app/globals.css:2775-2821` | La banda de leyenda la pinta el motor (§3.4); las otras tres son del reproductor.             |
| Botón de pantalla completa (SPEC 19) y su layout de escritorio                   | `components/game-player.tsx:423-436`, `app/globals.css:1493`       | Automático: ni una línea nueva.                                                               |
| `user-select: none` sobre todo `.av-player` (SPEC 23)                            | `app/globals.css`                                                  | Automático: el tubo nuevo no abre el menú de copiar de iOS.                                   |
| Contador `plays` y guardado real (SPEC 18)                                       | `increment_game_plays` al montar, `save_score` en el panel         | Automático en cuanto exista la fila en `public.games` y el `slug` tenga entrada en `ENGINES`. |
| Marco CRT, scanlines, `.crt-bottom-desktop`                                      | `.crt` / `.crt-screen` (`app/globals.css:1265-1296`)               | El tablero vive **dentro** de `.crt-screen`.                                                  |

Lo único que cambia de estructura es que `ENGINES` (`components/game-player.tsx:87-140`) pasa de cuatro filas a cinco — una fila más, no otra rama, tal y como fija `CLAUDE.md`.

### 1.2 Lo que trae la referencia

`references/started-games/06-serpiente/game.js` (unas 300 líneas, `'use strict'`, sin módulos) es un snake completo sobre un único `<canvas>`. Sus números y reglas, tal y como se verificaron jugándolo antes de escribir esta spec:

| Concepto           | Valor en la referencia                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Tablero            | `COLS=24, ROWS=18, CELL=24` → canvas 576 × 432 (**4:3 exacto**)                                             |
| Serpiente          | Array de `{x, y}`, cabeza en el índice 0, `START_LENGTH=4` centrada, rumbo inicial `→`                      |
| Paso               | `tickMs() = max(60, 150 − (nivel − 1) × 12)` ms, acumulador de tiempo independiente del fotograma           |
| Crecimiento        | `unshift(next)` siempre; `pop()` sólo cuando el paso no come. Ésa es toda la regla                          |
| Fruta              | Una, colocada eligiendo de la lista de celdas libres con `Math.random()` — no por muestreo con rechazo      |
| Puntuación         | `SCORE_PER_FRUIT (10) × nivel` por fruta                                                                    |
| Nivel              | `1 + floor(frutas / FRUITS_PER_LEVEL (5))`, sin techo                                                       |
| Vidas              | Una: el muro o el cuerpo propio terminan la partida al instante                                             |
| Victoria           | **Ninguna.** No hay rama de tablero completado ni bandera `win`                                             |
| Entrada            | Flechas **sólo por flanco** (`pressed()`), **sin repetición al mantener**, encoladas en `dirQueue` (tope 2) |
| Cola que se libera | El último segmento se excluye de la colisión cuando el paso no come: seguirte a distancia cero es legal     |
| `dt` acotado       | `Math.min(dt, 200)`: una pestaña en segundo plano no suelta una ráfaga de pasos al volver                   |
| Táctil             | Ya resuelto en `index.html`: cruceta que escribe en el mismo estado de teclas que el teclado físico         |
| Sonido             | Ninguno                                                                                                     |

Dos cosas de la referencia **no encajan** y se sustituyen (§6): su overlay de fin de partida dibujado en canvas (`drawOverlay`, con el `PUNTAJE` y el «ESPACIO PARA REINICIAR») — el panel del tubo de SPEC 22 ya cubre ese papel —, y su panel DOM lateral con `NIVEL`/`LONGITUD`, que aquí no existe: el nivel ya lo pinta el HUD y la banda `.screen-stats`, y pintarlo otra vez sería la mentira duplicada que `CLAUDE.md` prohíbe.

Y una cosa **sí cambia de número**: la rejilla pasa de 24 × 18 a **20 × 15** (§3.4), por la aritmética del tubo en móvil. El `CLAUDE.md` del propio prototipo ya deja escrito que ese número es el único que un port a React debe revisar.

### 1.3 El contrato vivo (medido, no la prosa de specs anteriores)

- `components/game-player.tsx:87-140` — `ENGINES: Record<string, { Component: ComponentType<EngineProps>; screen: string; pad: PadLayout }>`, hoy `tetrix`/`asteroides`/`arkanoid`/`buscaminas`.
- `components/game-player.tsx:66-77` — `EngineProps` vivo: `{ paused, onTogglePause, onRun, onOver, initialLives, maxLevel, padRef }`. El `padRef` de SPEC 21 es obligatorio; `BUSCAMINAS` es el precedente de declarar un tipo local estructuralmente idéntico.
- **No queda ninguna regla `.crt-screen.tetris` / `.rocks` / `.minas` en `app/globals.css`.** SPEC 21 las eliminó: `.crt-screen` es `4 / 3` en escritorio y `aspect-ratio: auto` con tres bandas apiladas a ≤ 720px, y la proporción del juego la lleva el escenario. Los valores `screen` que quedan en `ENGINES` son ganchos vestigiales sin CSS detrás. **`SERPIENTE` entra con `screen: ""`**, como `ARKANOID`, porque no hay nada que modificar.
- `app/globals.css:2807-2821` — la lista `.tetris-stage, .rocks-stage, .ark-stage, .minas-stage` es la que pone `aspect-ratio: 4 / 3; min-height: 0; overflow: hidden` a la banda del juego en móvil. **Es una lista literal: hay que añadir `.snake-stage` o la banda nueva no mide como las otras cuatro** — y hay un test que lo comprueba (§3.9).
- `app/globals.css:2859-2864` — la lista `.tetris-side > .tetris-block:not(.tetris-next), .rocks-side, .minas-side, .ark-pad` es la que oculta los mandos de dentro del tubo a ≤ 720px. **También es literal: hay que añadir `.snake-side`** (la columna entera, no `.snake-pad`, que es un hijo suyo).
- `lib/supabase/games.ts:13-33` — `Game` completo: `id, title, short, long, cat, cover, image, color, best, plays, dificultad, jugadores, perifericos, vidas, niveles`.
- `lib/supabase/games.ts:85-99` — `getGames()` ordena `.order("created_at").order("slug")`. Los tres primeros juegos comparten `created_at` (un solo `insert` en su migración) y se desempatan alfabéticamente, así que el orden vivo es **`arkanoid`, `asteroides`, `tetrix`, `buscaminas`** — probado por dos tests a la vez: `tests/screens.spec.ts:302` (la primera `.mini-card` enlaza a `/juego/arkanoid`) y `:395-404` (el chip `PUZZLE` pinta `TETRIX` antes de `BUSCAMINAS`). Una migración nueva trae un `created_at` posterior, así que **`SERPIENTE` entra al final** y no desplaza nada.
- `components/hall-of-fame.tsx:26` — pestaña por defecto `games[0].id`, que hoy es **`arkanoid`**, no `tetrix` (la prosa de SPEC 20 §1.3 es de antes del desempate por `slug`). No cambia.
- `supabase/migrations/20260927082152_*.sql` + `20260927091451_*.sql` + `20260928094713_catalogo_buscaminas.sql` — esquema real de `games`/`categorias` (citado en §3.1). Las cuatro filas sembradas son las cuatro jugables: **no queda ninguna fila decorativa**, así que `SERPIENTE` es puramente aditivo.
- `public/juegos/` — `tetrix.png`, `asteroides.png`, `arkanoid.png`, `buscaminas.png`. Un juego puede lanzarse con `image: null` y su `cover` CSS de respaldo; ese camino ya lo soportan `components/game-card.tsx` y `components/home/mini-card.tsx`.

### 1.4 Efectos colaterales medidos del quinto juego

| Qué cambia                                  | Por qué                                                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.mini-card` pasa de 4 a 5                  | `tests/screens.spec.ts:287`. `components/home/home-games.tsx` pinta todos los juegos, sin recorte.                                                                                                     |
| `.card` y `.cover-bg` pasan de 4 a 5        | `tests/screens.spec.ts:361-362` y `:414` (tras volver de la ficha). El nombre del test `"muestra los 4 juegos"` también cambia.                                                                        |
| `.hall-tabs .chip` pasa de 4 a 5            | `tests/screens.spec.ts:2189`. `components/hall-of-fame.tsx` pinta un chip por juego.                                                                                                                   |
| El chip `ARCADE` pasa de una tarjeta a dos  | `arkanoid` deja de estar solo en su categoría. No hay test que lo cuente hoy; se añade uno (§3.9).                                                                                                     |
| `JUEGOS` del bloque de mando móvil pasa a 5 | `tests/screens.spec.ts:1441`. Cinco tests recorren ese array y `SERPIENTE` tiene que pasarlos todos.                                                                                                   |
| La lista de selectores de escenario         | `tests/screens.spec.ts:1687` (`.tetris-stage, .rocks-stage, .ark-stage, .minas-stage`) y `app/globals.css:2807`: las dos son literales y suman `.snake-stage`.                                         |
| La lista que oculta mandos en móvil         | `app/globals.css:2859`: literal, suma `.snake-side` (no `.snake-pad`).                                                                                                                                 |
| La tabla de mandos de escritorio            | `tests/screens.spec.ts:1925-1930` suma `["serpiente", ".snake-pad .btn"]`.                                                                                                                             |
| Cuatro capturas de referencia               | `home-*` (una tarjeta más en el `.mini-rail`) y `biblioteca-*` (una más en la rejilla), en los dos proyectos. `salon-*` sólo si el chip nuevo mueve visualmente la fila de pestañas: se revisa a mano. |
| Prosa desmentida                            | `README.md` («cuatro juegos»), la sección «Project» de `CLAUDE.md` y `references/started-games/games.md`, que se titula «The four games».                                                              |

Y lo que, medido, **no** cambia:

| Qué no cambia                                      | Por qué                                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| La pestaña por defecto de `/salon`                 | `games[0].id` sigue siendo `arkanoid`: `SERPIENTE` entra al final, ordenado por `created_at`.                                                   |
| La primera `.mini-card` de `/`                     | Sigue siendo `arkanoid` por la misma razón (`tests/screens.spec.ts:302`).                                                                       |
| El test de teclas apagadas del mando               | `tests/screens.spec.ts:1540-1560` ancla en `ARKANOID` (tres `.is-off`). `SERPIENTE` usa los seis mandos, así que tiene cero — y no es el ancla. |
| Las puntuaciones de los cuatro juegos existentes   | `public.scores` no se toca. `SERPIENTE` estrena fila en `games` y no tiene puntuaciones hasta que alguien juegue de verdad.                     |
| Los chips `PUZZLE` / `SHOOTER` / `VERSUS`          | Sólo crece `ARCADE`. `VERSUS` sigue vacío a propósito (gate 7 del `game-planner`).                                                              |
| `detalle-*`, `reproductor-*`, `auth-*`, `acerca-*` | Sus rutas no dependen del tamaño del catálogo.                                                                                                  |
| Los cuatro motores existentes                      | Ni `lib/`, ni `components/`, ni su CSS. Lo único compartido que se toca son dos listas de selectores y una fila de `ENGINES`.                   |

---

## 2. Alcance

**Dentro:**

- `lib/serpiente.ts`: motor puro, sin `document`/`window`/`canvas`.
- `components/serpiente-game.tsx`: `<canvas>`, bucle `requestAnimationFrame` con acumulador de tiempo, teclado por flanco sin repetición, cruceta propia dentro del tubo para escritorio, y `padRef` publicado para el mando de móvil.
- `components/game-player.tsx`: fila nueva `serpiente` en `ENGINES`, con su `PadLayout`.
- Migración `supabase/migrations/<timestamp>_catalogo_serpiente.sql`: fila nueva en `public.games`, sin cambios de esquema.
- Clase nueva `.cover-snake` en `app/globals.css`, dibujada en CSS puro.
- Clases `.snake-*` (`stage`, `board`, `pad`) y su alta en las dos listas literales de `app/globals.css` (§1.3).
- Captura real en `public/juegos/serpiente.png`, tomada con el juego ya jugable.
- Ajuste de los cinco recuentos y de las tres listas de `tests/screens.spec.ts` (§1.4), más un `describe("serpiente")` nuevo sin captura del tablero.
- `README.md` (prosa + índice de specs + árbol de ficheros), la sección «Project» de `CLAUDE.md`, y `references/started-games/games.md`.

**Fuera:**

- **Persistir puntuaciones más allá de `save_score`.** Automático desde que existe la fila y la entrada en `ENGINES`; no hay nada que escribir.
- **Sonido.** Decisión repetida en las cuatro specs anteriores; sigue sin haber una línea de audio en el proyecto.
- **Bordes que envuelven (wrap).** La referencia muere contra el muro y es la mitad de la tensión del juego.
- **Obstáculos, muros interiores, frutas especiales, power-ups.** La referencia no los tiene y no se pidieron. `ARKANOID` ganó los suyos en una spec propia (SPEC 24), que es el precedente de cómo se añaden.
- **Conducir tocando el lienzo** (deslizar el dedo, o tocar el lado al que girar). La cruceta del mando ya es la vía táctil, y añadir un gesto sobre el canvas es una mecánica nueva no pedida.
- **Dos jugadores.** `VERSUS` y `jugadores = 2` siguen vacíos a propósito: `public.scores` sólo sabe acreditar un `auth.uid()`.
- **Cambios en el HUD, en el mando o en el panel del tubo.** Ni un bloque nuevo, ni un botón nuevo, ni una pastilla nueva: son comunes a los cinco juegos.
- **Los otros cuatro juegos.** `TETRIX`, `ASTEROIDES`, `ARKANOID` y `BUSCAMINAS` quedan exactamente igual.

---

## 3. Diseño

### 3.1 Catálogo (`public.games`)

Ningún cambio de esquema: todas las columnas existen y están `not null` salvo `cover`/`image`. Un único `insert`, igual que `BUSCAMINAS`:

```sql
-- SERPIENTE: quinto juego del catálogo, puramente aditivo — no hay ninguna
-- fila decorativa que sustituir ni columna nueva que añadir (SPEC 25).
insert into public.games (
  slug, nombre, niveles, vidas,
  categoria_id, color, cover, image, short, long,
  dificultad, jugadores, perifericos
) values (
  'serpiente', 'SERPIENTE', null, 1,
  (select id from public.categorias where nombre = 'ARCADE'),
  'green', 'cover-snake', '/juegos/serpiente.png',
  'Crece sin morderte la cola ni chocar contra el muro.',
  'Una serpiente de neón recorre una rejilla de 20 por 15 y nunca se detiene: gírala para atrapar la fruta y hacerla más larga. Cada cinco frutas sube el nivel y el paso se acorta, sin final. Una sola vida: chocar contra el muro o contra tu propio cuerpo termina la partida.',
  1, 1, array['teclado']
);
```

Cada valor, justificado contra los `CHECK` vivos:

- `niveles = null`: sin tope, como `ASTEROIDES`/`ARKANOID`/`BUSCAMINAS`. El freno real es `TICK_MIN`, no el nivel (§3.2).
- `vidas = 1`: como `TETRIX`, `ASTEROIDES` y `BUSCAMINAS`. Un snake con vidas de sobra deja de ser un snake: el error tiene que costar la partida.
- `categoria_id = ARCADE`: segunda entrada de la columna más fina de las ocupadas. `arkanoid` deja de estar solo.
- `color = 'green'`: los cuatro tokens del `CHECK` (`cyan`/`magenta`/`yellow`/`green`) están tomados, así que el quinto juego **reutiliza** uno. `green` es el de `BUSCAMINAS`, que es `PUZZLE`: al ser `SERPIENTE` de `ARCADE`, los dos verdes nunca aparecen juntos bajo un filtro de categoría de `LibraryBrowser`. Ningún token nuevo, ningún `CHECK` que ampliar.
- `dificultad = 1`: **el único valor del rango 1–5 que ningún juego usaba** (`BUSCAMINAS` 2, `ARKANOID` 3, `TETRIX` 4, `ASTEROIDES` 5). Y es honesto: cuatro teclas, una regla, y los primeros niveles son lentos.
- `jugadores = 1`, `perifericos = array['teclado']`: sólo teclado de verdad jugable. A diferencia de `ARKANOID`/`BUSCAMINAS` no hay nada que el ratón haga mejor — no se apunta ni se señala una celda, se conduce.
- `plays` no se menciona: tiene `default 0`.

Por «Database first, code second» (`CLAUDE.md`), esta migración se empuja con `supabase db push` **antes** de fusionar a `main`; es aditiva y no rompe ningún código viejo.

### 3.2 El motor (`lib/serpiente.ts`)

Módulo puro: sin `document`, sin `window`, sin canvas. Mismo motivo que en los otros cuatro.

```ts
export const COLS = 20;
export const ROWS = 15;
export const CELL = 24;
export const WIDTH = COLS * CELL; // 480
export const HEIGHT = ROWS * CELL; // 360

export const START_LENGTH = 4;
export const SCORE_PER_FRUIT = 10;
export const FRUITS_PER_LEVEL = 5;

/** Paso del nivel 1, en ms; se recorta TICK_STEP por nivel hasta TICK_MIN. */
export const TICK_BASE = 150;
export const TICK_STEP = 12;
export const TICK_MIN = 60;

/** Giros encolados. Más de dos no es intención, es ruido. */
export const QUEUE_MAX = 2;

export type Point = { x: number; y: number };
/** Vector unitario de rumbo; sólo existen los cuatro de DIRS. */
export type Dir = Point;

export const DIRS: Record<"up" | "down" | "left" | "right", Dir>;

export type SerpienteState = {
  /** Cabeza en el índice 0. Nunca vacía. */
  snake: Point[];
  /** Rumbo aplicado en el último paso. */
  dir: Dir;
  /** Giros pendientes; step() consume exactamente uno. */
  dirQueue: Dir[];
  fruit: Point;
  /** false hasta la primera entrada de dirección; hasta entonces step() no avanza. */
  started: boolean;
  score: number;
  /** Frutas comidas en toda la partida; de aquí sale el nivel. */
  fruits: number;
  lives: number;
  level: number;
  /** true tras chocar: el reproductor abre el panel de fin. */
  over: boolean;
};

/** Paso del nivel dado: max(TICK_MIN, TICK_BASE − (level − 1) × TICK_STEP). */
export function tickMs(level: number): number;

export function createState(lives: number): SerpienteState;

/**
 * Arranca la partida. La llaman `enqueueDir` y `enqueueTurn`, así que cualquier
 * entrada de dirección la arranca — incluso una que la cola descarte luego por
 * repetida o por ser marcha atrás: arrancar y girar son dos cosas distintas.
 */
export function start(state: SerpienteState): void;

/**
 * Encola un giro. Se descarta si invierte —o repite— el rumbo pendiente, que
 * es el último de `dirQueue` o, con la cola vacía, `state.dir`. Sin efecto con
 * la cola llena o si `over`.
 */
export function enqueueDir(state: SerpienteState, dir: Dir): void;

/**
 * Encola un giro de 90° **relativo** al rumbo pendiente: `-1` a la izquierda,
 * `+1` a la derecha. Es lo que pulsan los botones A y B del mando (SPEC 21), y
 * acaba en el mismo `dirQueue` con las mismas reglas — no es una segunda vía de
 * estado, es otra forma de calcular qué dirección encolar.
 */
export function enqueueTurn(state: SerpienteState, turn: -1 | 1): void;

/**
 * Un paso. Consume un giro de la cola, avanza la cabeza, resuelve la colisión
 * y come o suelta la cola. Choque con el muro o con el cuerpo → lives = 0,
 * over = true. Fruta → score += SCORE_PER_FRUIT × level, fruits++, nivel
 * recalculado y fruta nueva. Sin efecto si `over` o si `!started`.
 */
export function step(state: SerpienteState): void;
```

Reglas, calcadas de la referencia (§1.2) salvo donde se dice lo contrario:

- **La partida espera quieta al primer giro** (`started`). Es el `serving` de `lib/arkanoid.ts` aplicado a un snake, y por el mismo motivo: la serpiente nace en el centro mirando a la derecha, así que le quedan **nueve** celdas de pista y a 150 ms el paso choca contra el muro en **1,35 s** — menos de lo que tarda un jugador en orientarse tras cargar la página, y menos de lo que tarda Playwright en llegar a su primera aserción. Cualquiera de las cuatro direcciones arranca, incluso una que la cola descarte después por repetida (→, el rumbo que ya lleva) o por ser marcha atrás (←): arrancar y girar son dos cosas distintas. Una vez arrancada no se detiene nunca más, que es el género.
- `tickMs(level) = Math.max(TICK_MIN, TICK_BASE - (level - 1) * TICK_STEP)`: 150 ms en el nivel 1, 138 en el 2, … y clavado en 60 ms desde el nivel 9 (el 8 va a 66 ms). **Ese suelo es el tope real de dificultad**, igual que `MINE_CAP` lo es en `BUSCAMINAS` y la curva de velocidad de la bola en `ARKANOID`: el nivel no tiene techo, el mecanismo sí.
- `level = 1 + Math.floor(state.fruits / FRUITS_PER_LEVEL)`, recalculado en `step()` al comer. No es un campo independiente que pueda desincronizarse de `fruits`.
- Puntuación `SCORE_PER_FRUIT × level`: la misma fruta vale 10 en el nivel 1 y 40 en el 4. Con progresión real de nivel, el nivel multiplica — igual que `TETRIX`, `ARKANOID` y `BUSCAMINAS`, y a diferencia de `ASTEROIDES`, que renunció al multiplicador justo por no tener niveles.
- **La cola de giros es la regla no negociable del motor.** Con una sola ranura, dos giros dentro del mismo paso se sobrescriben: el segundo se valida contra `state.dir`, que todavía no ha avanzado, así que «derecha y luego arriba» en el mismo instante puede resolverse en una inversión y la serpiente se come el cuello. Es el bug clásico del género, invisible hasta que un jugador rápido lo encuentra. Por eso `enqueueDir` valida contra el **último elemento de `dirQueue`** (y sólo contra `state.dir` cuando la cola está vacía) y `step()` consume exactamente uno por paso.
- **La cola que se libera no es un choque.** Cuando el paso no come, el último segmento abandona su celda en ese mismo paso, así que se excluye de la comprobación de colisión. Sin esa exclusión, seguirse a distancia cero mataría al jugador por hacer lo correcto.
- Colisión con el muro: no hay wrap. Salir de `[0, COLS) × [0, ROWS)` termina la partida.
- Fruta: se elige de la **lista de celdas libres**, no por muestreo con rechazo. Con la serpiente ocupando buena parte de una rejilla de 300 celdas, el rechazo degenera; recorrer las libres no.
- Fin de partida: `lives = 0` y `over = true` en el mismo instante, igual de definitivo en el nivel 1 que en el 20.
- **Sin estado de victoria.** No hay rama de rejilla completada ni bandera `win`. La puntuación es monótona y el nivel no tiene techo: es lo que mantiene el marcador abierto, y es lo que hizo que el `game-planner` rechazara `ALMACÉN` por su gate 5.
- **Sin necesidad de sembrar el azar para los tests.** El único azar es la posición de la fruta, y ninguna aserción depende de él: un giro cambia el lienzo, y la puntuación sube de 0 tras comer una fruta a la que el test conduce. No hace falta copiar un LCG como `ARKANOID` ni importar nada.

### 3.3 El componente (`components/serpiente-game.tsx`)

Cliente (`"use client"`). Contrato **idéntico** al de los otros cuatro, con el tipo local estructuralmente igual que ya usa `BUSCAMINAS`:

```ts
export type SerpienteRun = { score: number; lives: number; level: number };

type SerpienteGameProps = {
  paused: boolean;
  onTogglePause: () => void;
  onRun: (run: SerpienteRun) => void;
  onOver: () => void;
  initialLives: number;
  /** Ignorado: el nivel de SERPIENTE no tiene techo (games.niveles = null). */
  maxLevel: number | null;
  padRef: Ref<PadHandle>;
};
```

Estructura interna, copiada del patrón de `components/tetris-game.tsx`, que es el motor con bucle temporizado más cercano:

1. **Estado en un `useRef`.** `stateRef.current ??= createState(initialLives)`, mutación in situ — nunca `useState` por fotograma.
2. **Bucle.** `requestAnimationFrame` con acumulador, calcado del bucle de caída de `tetris-game.tsx:289-319`. Mientras `!started` el bucle gira y repinta pero `step()` no avanza nada, así que el jugador ve el tablero quieto hasta que pulsa: `accum += ts − last`, y un `while (accum >= tickMs(state.level))` que drena en pasos discretos, recalculando el intervalo dentro del bucle porque el nivel puede subir en medio. **`dt` se acota a 200 ms** antes de acumular: sin eso, volver de una pestaña en segundo plano suelta una ráfaga de pasos que el jugador no vio y lo mata. Se cancela en el `cleanup`, al pausar y al terminar.
3. **Aviso al HUD.** `publish()` compara `score`/`lives`/`level` con el último aviso y sólo entonces llama a `onRun` — mismo patrón que los otros cuatro.
4. **Canvas.** Tamaño lógico `WIDTH × HEIGHT` (480 × 360), escalado por `devicePixelRatio`. Se pinta: rejilla tenue, fruta, cuerpo (atenuándose hacia la cola, para leer de un vistazo la propia trayectoria) y cabeza con los ojos orientados al rumbo. **Nada más**: ni puntuación, ni vidas, ni nivel.
5. **Teclado.** Las cuatro flechas llaman a `enqueueDir`, **por flanco y sin repetición** — no hay `setInterval` de repetición como en `TETRIX`, porque mantener una flecha pulsada en un snake no significa nada: la serpiente ya se mueve sola, y una repetición sólo llenaría la cola con el mismo rumbo que `enqueueDir` descarta. Las cuatro llevan `preventDefault()` o la página se desplaza. `P` llama a `onTogglePause` — nunca estado local.
6. **Cruceta de escritorio.** Cuatro `.btn` en `.snake-pad`, dentro de `.snake-side` (columna lateral, patrón de `.minas-side`), en una cruz de tres columnas, **sin repetición al mantener** (coherente con el teclado). Es el único control dentro del tubo: no hay botón de pausa, ni `SIGUIENTE`, ni nada más.
7. **`padRef` (SPEC 21).** `useImperativeHandle` publica `{ press, release }` enrutando por el **mismo** camino de entrada que ya existe: `up`/`down`/`left`/`right` → `enqueueDir`, `a` → `enqueueTurn(+1)`, `b` → `enqueueTurn(−1)`. `release` es un no-op, porque no hay nada que repita mientras se mantiene — es la primera vez que un motor lo deja vacío, y es correcto: la regla de SPEC 21 es que el motor recibe `press`/`release` y decide, y aquí la decisión es que soltar no significa nada.
8. **Colores leídos del CSS una sola vez al montar**, con `getComputedStyle`, y literales hex de respaldo — mismo patrón que `PIECE_FALLBACK` en `tetris-game.tsx:38`.
9. **Reinicio.** Sin lógica propia: `REINICIAR` cambia `runKey` en el reproductor y React remonta con `createState(initialLives)` de cero.

### 3.4 Reparto dentro de `.crt-screen`

El tablero (480 × 360) es exactamente 4:3, y la serpiente puede estar en **cualquier** celda de la rejilla, incluida la última fila. La decisión original de esta spec adoptaba el patrón de `ARKANOID` (franja de mandos debajo del tablero); **se revisó durante la implementación, a petición explícita, por el de `BUSCAMINAS`** (`.minas-stage`): **columna, tablero a la izquierda y los mandos en una columna lateral a la derecha**, nunca encima del campo. El motivo de la corrección no es técnico — el patrón de `ARKANOID` también evita el solape —, es de consistencia visual: `BUSCAMINAS` es el otro juego que no cae y cuyo cursor también puede estar en cualquier celda, así que comparte exactamente el mismo problema de reparto, y los dos deben leerse como la misma familia de pantalla en vez de que cada uno resuelva el "mando no tapa el tablero" con una silueta distinta.

```
┌─ .crt-screen ─────────────────────────────┐
│  .screen-signal     SEÑAL OK · SERPIENTE     │
│  .screen-legend          LEYENDA             │   ← sólo visible a ≤ 720px
│ ┌─ .snake-stage ──────────────────────────┐ │
│ │ ┌──────────────┐                        │ │
│ │ │              │     GIRO               │ │
│ │ │   20 × 15    │      [▲]               │ │
│ │ │              │   [◀][▼][▶]  .snake-side│ │
│ │ └──────────────┘                        │ │
│ └──────────────────────────────────────────┘ │
│  .screen-stats     PTS · VIDAS · NIVEL       │   ← sólo visible a ≤ 720px
└───────────────────────────────────────────┘
```

Clases nuevas en `app/globals.css`, en un bloque hermano de `.minas-*`:

- `.snake-stage` — igual que `.minas-stage`: `position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: clamp(8px, 2%, 20px); padding: clamp(8px, 2%, 18px);` con el mismo fondo `radial-gradient` compartido.
- `.snake-board` — igual que `.minas-board`: `width: auto; height: auto; max-width: 100%; max-height: 100%; min-width: 0; border: 1px solid var(--line);`. Sin `touch-action: none` ni `cursor: pointer`: no hay arrastre que proteger ni ratón que señale una celda.
- `.snake-side` — columna lateral igual que `.minas-side`: `display: flex; flex-direction: column; align-self: stretch; align-items: center; justify-content: center; gap: clamp(8px, 2%, 14px); width: clamp(84px, 22%, 180px); flex: 0 0 auto;`, con un único `.snake-block` dentro (rótulo `GIRO` + la cruceta) — a diferencia de `.minas-side`, que lleva tres bloques (`MOVIMIENTO`/`REVELAR`/`MARCAR`).
- `.snake-pad` — dentro de `.snake-block`, rejilla de tres columnas con `▲` arriba y `◀ ▼ ▶` debajo, mismo patrón de `.minas-pad` (celdas cuadradas por `aspect-ratio: 1 / 1`).

**Aritmética a 1440 px** (medida en el navegador). `.crt-screen` mide 1004 × 753. Con la columna lateral de hasta 180 px más el `gap`, al tablero le sobra espacio de ancho y de alto — a diferencia de `ARKANOID`/`BUSCAMINAS`, cuyo tablero nativo (800×600 y 576×432) es mayor que el hueco disponible y por eso lo llena, aquí el tablero nativo (480×360) es **menor** que el hueco, así que `width/height: auto` lo deja en su tamaño real: el canvas se dibuja a **482 × 362** (480×360 más el borde de 1 px) y la celda mide **24,1** px — el mismo `CELL = 24` del motor, sin escalar.

**Aritmética a 390 px** (medida en el navegador, sin cambios respecto a la versión anterior de esta spec: el reparto de escritorio no afecta a móvil). `.crt-screen` deja de ser una proporción y apila cuatro bandas (SPEC 21); la del juego es `.snake-stage` con su propio `aspect-ratio: 4 / 3`, así que hay que darla de alta en la lista literal de `app/globals.css:2807` o la banda no mide como las otras cuatro. El tubo mide **355** px de ancho, así que la banda sale a 355 × 266,3 (proporción 1,333 exacta) y el tablero a **339 × 254,3**, con la celda en **16,95 px**.

Ese número queda por debajo de los 18 px que `BUSCAMINAS` midió como suelo —aunque muy cerca—, y lo importante es que **no es el mismo suelo**. En `BUSCAMINAS` la celda es un objetivo táctil: el dedo tiene que acertar una casilla concreta. En `SERPIENTE` **ninguna celda es nunca un objetivo** — se conduce con cuatro teclas del mando —, así que el suelo aquí es de legibilidad, no de pulgar: hace falta ver dónde está la cabeza y dónde la fruta, y 16,95 px con la cabeza en un verde claro y la fruta en rojo lo cumplen de sobra. Por eso la rejilla baja de los 24 × 18 del prototipo a 20 × 15: a 24 columnas la celda caería a ~14,1 px, que ya es fina para distinguir cuerpo de fondo en un tubo con scanlines.

`.snake-side` entra en la lista literal de `app/globals.css:2859` (no `.snake-pad`, que es un hijo suyo): es la que oculta los mandos de dentro del tubo a ≤ 720px, y es la columna entera — rótulo incluido — la que debe desaparecer, mismo criterio que `.minas-side`. En móvil conduce el mando de abajo y el lienzo se queda con toda la banda.

**Banda de leyenda.** `SERPIENTE` no tiene nada que explicar — ni power-ups como `ASTEROIDES`/`ARKANOID`, ni contadores como `BUSCAMINAS` —, así que reserva la banda y pinta `LEYENDA` centrado con `.screen-legend-empty`, exactamente como `TETRIX` (`components/tetris-game.tsx:435-437`). La banda se reserva igual: la regla de SPEC 21 es que **todos** los juegos la reservan, para que los cinco midan lo mismo.

### 3.5 Colores

**Ningún token nuevo en `:root`.** El juego se pinta con lo que ya hay:

```
cuerpo y cabeza  → var(--green)   (el color de catálogo del juego)
fruta            → var(--red)     (el que SPEC 21 añadió para la mina)
rejilla          → var(--line)    (lo mismo que usa .tetris-board)
```

La cabeza es `--green` aclarado y los ojos un gris casi negro sin tokenizar, mismo criterio que los literales de fondo de `.tetris-stage`: no son parte de la familia `--piece-*`/`--rock-*`/`--brick-*`, son dibujo del escenario. Cero hex nuevos.

### 3.6 Cobertura del catálogo (`.cover-snake`)

Como `BUSCAMINAS`, `SERPIENTE` es puramente aditivo: no hay ninguna clase `cover-*` huérfana que reciclar. `.cover-snake` se dibuja desde cero en `app/globals.css`, junto a las otras cuatro y con el mismo lenguaje visual (gradiente de fondo más un `::before`/`::after` con formas geométricas): un recorrido en zigzag de celdas verdes con un punto rojo delante, en la paleta `--green`/`--red`/`--ink-faint`. Sirve de respaldo mientras `image` sea `null` y, en `/biblioteca`, lo sustituye `cover-shot` en cuanto exista `public/juegos/serpiente.png`.

El nombre es `cover-snake`, no `cover-serpiente`: las cuatro existentes son `cover-tetro`, `cover-rocas`, `cover-bricks` y `cover-minas` — fichas cortas, ninguna es el `slug` entero — y `snake` es la que mantiene esa familia junto a los prefijos `.tetris-`/`.rocks-`/`.ark-`/`.minas-` de los escenarios. El `game-planner` había propuesto `cover-serpiente` en su ficha del ledger; se corrige aquí a sabiendas, porque el ledger describe candidatos y es esta spec la que fija la fila real.

### 3.7 `ENGINES` (`components/game-player.tsx`)

Una fila más, no otra rama:

```ts
serpiente: {
  Component: SerpienteGame,
  screen: "",
  pad: {
    dpad: {
      up: "Girar hacia arriba",
      down: "Girar hacia abajo",
      left: "Girar a la izquierda",
      right: "Girar a la derecha",
    },
    buttons: ["Girar a la derecha", "Girar a la izquierda"],
  },
},
```

`screen: ""` como `ARKANOID`: el tablero ya es el 4:3 del tubo y, además, **ya no existe ninguna regla CSS para esos modificadores** (§1.3).

Los dos botones de acción hacen un giro de 90° **relativo** al rumbo (A a la derecha, B a la izquierda) en lugar de quedar inertes. Es el mismo argumento con el que SPEC 23 revivió la `B` de `TETRIX`: un pulgar derecho apoyado en los círculos tiene que tener algo que hacer, y `SERPIENTE` sería el primer juego del catálogo con **los dos** muertos. Los nombres de `dpad` y de `buttons` se repiten a propósito («Girar a la derecha» está en los dos): son `aria-label`, describen el efecto, y en el mando una flecha y un círculo pueden llevar al mismo sitio por caminos distintos — absoluto el de la cruceta, relativo el del círculo.

Nada más cambia en `game-player.tsx`: el HUD, el panel del tubo, `runKey`, `ignoreRun`, el botón de pantalla completa, el mando y el flujo `save_score`/`increment_game_plays` ya son genéricos sobre `game.id`.

### 3.8 Documentación

- `README.md` — «cuatro juegos» pasa a «cinco», con una frase sobre `SERPIENTE`: rejilla de 20 × 15, giros encolados, nivel sin techo que acorta el paso, una vida. Fila nueva en el índice de specs, y el árbol de ficheros suma `lib/serpiente.ts` y `components/serpiente-game.tsx`.
- Sección «Project» de `CLAUDE.md` — el párrafo de los cuatro motores gana un quinto, con la misma densidad que los otros.
- `references/started-games/games.md` — su título («The four games and the engine contract») y su sección «The catalog» pasan a cinco, con el párrafo de `SERPIENTE` al nivel de detalle de los otros cuatro: rejilla, cola de giros, curva de paso, y las dos reglas que se separan de la referencia. La sección «Adding a fifth game» pasa a hablar de un sexto.

### 3.9 Tests

**Arreglos obligados** (§1.4), en `tests/screens.spec.ts`:

| Línea     | Cambio                                                                   |
| --------- | ------------------------------------------------------------------------ |
| 287       | `.mini-card` `toHaveCount(4)` → `toHaveCount(5)`                         |
| 359       | nombre del test: `"muestra los 4 juegos"` → `"muestra los 5 juegos"`     |
| 361, 362  | `.card` / `.cover-bg` `toHaveCount(4)` → `toHaveCount(5)`                |
| 414       | `.card` `toHaveCount(4)` → `toHaveCount(5)`                              |
| 1441      | `JUEGOS` suma `"serpiente"`                                              |
| 1687      | la lista de selectores de escenario suma `.snake-stage`                  |
| 1925-1930 | la tabla de mandos de escritorio suma `["serpiente", ".snake-pad .btn"]` |
| 2189      | `.hall-tabs .chip` `toHaveCount(4)` → `toHaveCount(5)`                   |

Añadir `"serpiente"` a `JUEGOS` mete el juego en cinco tests de golpe, y los cinco tienen que pasar sin tocarlos: el tubo sin un botón visible, la silueta del mando (cuatro brazos, dos círculos, las cuatro etiquetas `B`/`A`/`PAUSA`/`MENÚ`), la banda del juego midiendo igual que las otras cuatro, y que se juegue de verdad con el mando. Para el último hay que añadir el tramo propio del juego al final de ese test, con el patrón de los otros cuatro: huella del `canvas.snake-board`, `pulsar("Girar hacia arriba", 60)`, y la huella cambia.

**Dos bloques, no uno.** Las **reglas** del motor van a un `describe("serpiente — motor (módulo puro)")` sin navegador, siguiendo el precedente de `arkanoid — motor de premios y multibola (módulo puro)` (`tests/screens.spec.ts:1169`), que ya importa de `../lib/arkanoid` dentro de la misma suite. El motivo es concreto y se midió: la serpiente avanza sola a 150 ms el paso, así que comprobar desde Playwright que la marcha atrás se descarta —o que comer suma `10 × nivel`— es una carrera contra el reloj del motor; o se conduce a ciegas contra una fruta aleatoria, o se mide cuando la partida ya terminó. Sobre el módulo puro las dos cosas son exactas. Cubre: la curva de `tickMs` con su suelo, nacer quieta y arrancar con cualquier dirección, la marcha atrás descartada y el tope de cola, **dos giros dentro del mismo paso**, la cola que se libera, el muro mortal sin wrap, comer con su multiplicador y la subida de nivel, el giro relativo de A/B, y que no hay estado de victoria.

**`describe("serpiente")` de navegador**, con el patrón de `describe("buscaminas")`: reloj **vivo** (es el motor que más lo necesita de los cinco) y sin captura del tablero. Se queda sólo con lo que el navegador es el único en poder probar — el cableado, el HUD, la pausa y el mando:

1. **Arranque.** En `/jugar/serpiente`: `.snake-board` visible, HUD con `Puntuación 0`, **un** `♥` y `Nivel 01`; `.crt-screen .snake-pad .btn` cuenta 4, y dentro de `.crt-screen` no hay ningún botón de pausa.
2. **Espera quieta al primer giro y entonces ya no se detiene.** Sin pulsar nada, la cabeza sigue en la misma celda 1,2 s después y la partida está viva; tras una flecha, avanza sola sin volver a pulsar. Sin `started` este bloque entero era inejecutable: la partida terminaba antes de la primera aserción.
3. **Girar cambia el rumbo y no desplaza la página.** `ArrowUp` baja la fila de la cabeza; las cuatro flechas dejan `window.scrollY` en 0.
4. **Dos giros en el mismo paso no la matan**, también de extremo a extremo: es la regla no negociable y merece verse llegar por el teclado real, no sólo por el módulo.
5. **PAUSA congela el lienzo de verdad.** Aquí la aserción es más fuerte que en los otros cuatro: sin pausa el lienzo cambiaría solo, así que exigirlo **idéntico** un segundo prueba que el bucle está cancelado, no sólo que el cartel se pintó.

La cabeza se localiza con `cabezaSerpiente()`, un ayudante que la lee del propio lienzo por color: `components/serpiente-game.tsx` la pinta con el verde del tema más un velo blanco al 45 %, así que es el único elemento con el rojo y el verde altos a la vez —el cuerpo lleva el verde sin velo (R ≈ 0) y la fruta es roja (G ≈ 47)—. Hace falta porque «la huella del lienzo cambió» no prueba nada en el único motor que se mueve solo.

**Extensión del test de paridad de HUD** (`describe("arkanoid")` › `el HUD es el mismo que el de los otros juegos`): se añade `serpiente` a la comparación, de forma que las cuatro etiquetas de `.player-hud .hud-stat .l` y los botones visibles de `.hud-actions` de los cinco juegos sean idénticos entre sí.

**Test nuevo en `describe("biblioteca")`:** el chip `ARCADE` muestra `ARKANOID` y `SERPIENTE`, dos tarjetas, con el patrón del test del chip `PUZZLE` (`:395-404`). Y en cuanto exista la captura, que la portada de `SERPIENTE` sea `cover-shot` con `src` a `serpiente.png`, con el patrón del test del chip `SHOOTER` (`:381-393`).

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y la suite en un estado conocido.

1. **Migración.** `supabase/migrations/<timestamp>_catalogo_serpiente.sql` según §3.1. _Comprobación:_ `npx supabase db reset`; `/juego/serpiente` responde 200, `/biblioteca` muestra cinco tarjetas, el chip `ARCADE` muestra `ARKANOID` y `SERPIENTE`, `/salon` sigue abriendo en `ARKANOID` y muestra cinco chips. La suite queda roja en los cinco recuentos de §3.9: se arregla en el paso 6.
2. **Motor.** `lib/serpiente.ts` completo (§3.2), sin consumidor todavía. _Comprobación:_ `npx tsc --noEmit` limpio; y en la consola del navegador, sobre el módulo puro: `tickMs(1)` es `150`, `tickMs(8)` es `60` y `tickMs(999)` sigue siendo `60`; `createState(1).snake` mide `4`; `enqueueDir` con el rumbo contrario deja `dirQueue` vacía; dos `enqueueDir` válidos seguidos dejan `dirQueue` con dos y el tercero no entra; `step()` sobre una cabeza pegada al muro pone `over = true` y `lives = 0`; un estado con la fruta delante de la cabeza suma `10 × level` y alarga la serpiente en uno; y una serpiente de longitud 5 avanzando recta **no** choca contra su propia cola.
3. **Tokens y CSS.** `.cover-snake` (§3.6) y las clases `.snake-*` (§3.4), **incluyendo el alta en las dos listas literales** de `app/globals.css` (§1.3). Sin tokens de color nuevos (§3.5). _Comprobación:_ los otros cuatro juegos se ven exactamente igual a 1440 px y a 390 px, y la tarjeta de `SERPIENTE` en `/biblioteca` pinta su dibujo CSS.
4. **Componente.** `components/serpiente-game.tsx` (§3.3). _Comprobación a mano en el navegador:_ la serpiente avanza sola desde el primer fotograma; las flechas giran y mantener una pulsada no hace nada distinto de pulsarla una vez; el rumbo contrario se descarta; dos giros rápidos en el mismo paso no la matan; comer alarga y sube la puntuación; subir de nivel acelera el paso de forma perceptible; chocar con el muro y chocar con el cuerpo terminan la partida; seguirse la cola a distancia cero **no** la termina; dentro del lienzo no hay ni puntuación, ni vidas, ni nivel; la cruceta de escritorio responde con el ratón; y volver de una pestaña en segundo plano no suelta una ráfaga de pasos.
5. **Reproductor.** La fila `serpiente` en `ENGINES` (§3.7). _Comprobación:_ en `/jugar/serpiente` el HUD sube con el juego, arranca con un corazón y `Nivel 01`; `PAUSA` congela de verdad (el lienzo se queda quieto) y `P` hace lo mismo que el botón; `MENÚ` abre el panel y pulsado otra vez devuelve la partida con su puntuación intacta; chocar abre el panel de `FIN DEL JUEGO` y el bucle no sigue detrás; `REINICIAR` devuelve serpiente nueva, `0` puntos, `Nivel 01` y un corazón. **A 390 px:** la cruceta de dentro del tubo no se ve, el mando de abajo conduce, los dos círculos giran en relativo (A derecha, B izquierda), la banda del juego mide lo mismo que en los otros cuatro y la celda ronda los 14,6 px previstos. Los otros cuatro juegos no han cambiado.
6. **Tests.** Los ocho arreglos, el `describe("serpiente")` y el test del chip `ARCADE` de §3.9. _Comprobación:_ `npm test` sólo falla en las capturas de referencia afectadas, por diferencia de imagen.
7. **Capturas.** Verificado a mano `/` y `/biblioteca` en los dos anchos (y `/salon` si el chip nuevo mueve el layout), `npx playwright test --update-snapshots`. Revisar el diff: sólo `home-*` y `biblioteca-*` (y, si aplica, `salon-*`) en los dos proyectos. Si aparece `detalle-*`, `reproductor-*`, `auth-*` o `acerca-*`, algo se ha filtrado y se para aquí.
8. **Captura del juego.** `public/juegos/serpiente.png`, tomada con el juego ya jugable, más el test de `cover-shot` de §3.9. Entra antes de fusionar, para que `image` no apunte a un fichero que no existe.
9. **Documentación y cierre.** `README.md`, `CLAUDE.md` y `references/started-games/games.md` según §3.8. _Verificación final:_ `npm test` verde, `npx tsc --noEmit` y `npm run lint` limpios.

---

## 5. Criterios de aceptación

- [ ] `public.games` gana una fila `serpiente` sin tocar el esquema existente; la migración es aditiva y se empuja con `supabase db push` antes de fusionar a `main`.
- [ ] `/juego/serpiente` y `/jugar/serpiente` responden 200.
- [ ] `/biblioteca` muestra cinco tarjetas; el chip `ARCADE` muestra `ARKANOID` y `SERPIENTE`.
- [ ] `/` sigue pintando su `.mini-rail` sin recorte, ahora con cinco tarjetas, y la primera sigue enlazando a `/juego/arkanoid`.
- [ ] `/salon` sigue abriendo en la pestaña `ARKANOID` y muestra cinco chips.
- [ ] La fila usa `dificultad = 1` — el único valor del rango que ningún juego ocupaba — y `color = 'green'`, reutilizado de `BUSCAMINAS` sin ampliar ningún `CHECK`.
- [ ] `perifericos` es `array['teclado']` y `jugadores` es `1`.
- [ ] `niveles` es `null` y `vidas` es `1`; el HUD arranca con **un** corazón y `Nivel 01`.
- [ ] La serpiente **espera quieta** hasta la primera entrada de dirección: cargar `/jugar/serpiente` y no tocar nada no consume la partida.
- [ ] Cualquiera de las cuatro flechas arranca la partida, incluida la del rumbo que ya lleva (→) y la marcha atrás (←), que la cola descarta igualmente como giro.
- [ ] Los dos círculos del mando también arrancan la partida.
- [ ] Una vez arrancada, la serpiente avanza sola y no se detiene nunca más sin pausa.
- [ ] Las cuatro flechas giran la serpiente; mantener una pulsada no produce ningún efecto distinto de pulsarla una vez.
- [ ] Las cuatro flechas llevan `preventDefault()`: jugar no desplaza la página.
- [ ] Un giro contrario al rumbo pendiente se descarta: la serpiente nunca da marcha atrás sobre su propio cuello.
- [ ] Dos giros válidos dentro de un mismo paso **no** matan a la serpiente: se encolan y se consumen uno por paso.
- [ ] La cola llena descarta el tercer giro en vez de desplazar la cola.
- [ ] Seguirse la propia cola a distancia cero no termina la partida: el último segmento se excluye de la colisión cuando el paso no come.
- [ ] Chocar contra el muro termina la partida; no hay bordes que envuelvan.
- [ ] Chocar contra el propio cuerpo termina la partida.
- [ ] Comer una fruta alarga la serpiente en exactamente un segmento y suma `10 × nivel` puntos.
- [ ] El nivel es `1 + floor(frutas / 5)` y el paso es `max(60, 150 − (nivel − 1) × 12)` ms, clavado en 60 ms desde el nivel 9 (el 8 va a 66 ms).
- [ ] No hay ningún estado de victoria: ni rama de rejilla completada, ni bandera `win`, ni tope de nivel.
- [ ] La fruta nunca aparece sobre la serpiente.
- [ ] Volver de una pestaña en segundo plano no suelta una ráfaga de pasos acumulados (`dt` acotado a 200 ms).
- [ ] Dentro del canvas no se dibuja ni puntuación, ni vidas, ni nivel.
- [ ] La banda `.screen-legend` se reserva y pinta `LEYENDA` centrado, como `TETRIX`.
- [ ] Dentro de la pantalla hay exactamente cuatro botones de dirección (`.snake-pad .btn`) y ningún botón de pausa.
- [ ] `ENGINES.serpiente.screen` es `""` y no se añade ninguna regla `.crt-screen.<modificador>` nueva.
- [ ] `ENGINES.serpiente.pad` declara las cuatro direcciones y los dos botones; en `/jugar/serpiente` el mando de móvil no tiene ninguna tecla apagada (`.is-off` cuenta 0) y los ocho controles son enfocables.
- [ ] Los círculos A y B giran 90° **relativo** al rumbo (A a la derecha, B a la izquierda) por el mismo `dirQueue` y con las mismas reglas que la cruceta.
- [ ] `PAUSA` (botón del HUD), `P` (teclado) y la pastilla del mando alternan el mismo estado; con la pausa activa el lienzo **no cambia** durante un segundo.
- [ ] `MENÚ` abre el panel dentro del tubo, congela el motor y, pulsado otra vez, devuelve la partida con puntuación, vidas y nivel intactos; el panel no tiene `CONTINUAR`.
- [ ] `PAUSA` y `MENÚ` se excluyen: el que no aplica queda gris y desactivado, nunca desaparece.
- [ ] La partida terminada abre el panel con `FIN DEL JUEGO` y no queda ningún `requestAnimationFrame` vivo detrás.
- [ ] `REINICIAR` devuelve serpiente nueva de longitud 4, `0` puntos, `Nivel 01` y un corazón.
- [ ] `GUARDAR PUNTUACIÓN` guarda de verdad cuando la partida es récord del jugador (vía `save_score`); con sesión de invitado el panel pide iniciar sesión y lleva a `/auth` con la puntuación y el nivel en la URL.
- [ ] El HUD de `/jugar/serpiente` es idéntico al de los otros cuatro juegos, y la silueta del mando en móvil también (cuatro brazos, dos círculos, las etiquetas `B`/`A`/`PAUSA`/`MENÚ`).
- [ ] A 1440 px el tablero se dibuja a su tamaño nativo (~482 × 362, celda ~24 px) con la columna `GIRO` a la derecha, sin tapar ninguna celda.
- [ ] A 390 px la banda del juego mide lo mismo que la de los otros cuatro (mismo ancho y alto, ±1 px, y proporción 4/3), con la celda en torno a 17 px.
- [ ] `.snake-stage` está en la lista de `app/globals.css:2807` y `.snake-side` en la de `:2859`.
- [ ] `.cover-snake` existe y se usa como respaldo mientras no haya captura; `cover-shot` la sustituye en cuanto exista `public/juegos/serpiente.png`.
- [ ] `lib/serpiente.ts` no referencia `document`, `window` ni `canvas`, y no siembra ningún generador de números aleatorios propio.
- [ ] No se añade ningún token de color nuevo a `:root`.
- [ ] `TETRIX`, `ASTEROIDES`, `ARKANOID` y `BUSCAMINAS` se comportan y se ven exactamente igual que antes de esta spec.
- [ ] De las capturas de referencia se regeneran exactamente `home-*` y `biblioteca-*` en los dos proyectos (más `salon-*` si el chip nuevo cambia visualmente su fila); `detalle-*`, `reproductor-*`, `auth-*` y `acerca-*` quedan intactas.
- [ ] Las reglas del motor (cola de giros, cola que se libera, marcha atrás, muro, puntuación, nivel, `started`, giro relativo) se comprueban sobre el **módulo puro**, no conduciendo el juego desde el navegador.
- [ ] El HUD de los cinco juegos sigue siendo idéntico, comprobado por el test de paridad extendido.
- [ ] `npm test` verde; `npx tsc --noEmit` y `npm run lint` limpios.
- [ ] `package.json` no tiene dependencias nuevas; no hay variables de entorno nuevas.
- [ ] De `components/game-player.tsx` sólo cambia la fila nueva de `ENGINES` y su `import`.

---

## 6. Decisiones

- **Sí:** quinto juego puramente aditivo, al final del array. No queda ninguna fila decorativa que sustituir (SPEC 17 las borró todas) y `getGames()` ordena por `created_at` con desempate por `slug`, así que una migración nueva entra al final sin desplazar nada ni mover la pestaña por defecto de `/salon`.
- **Sí:** `SERPIENTE` en mayúsculas, `slug` `serpiente`. Sigue la convención en español del catálogo (`TETRIX`, `ASTEROIDES`, `BUSCAMINAS`; `ARKANOID` es la única excepción, ya anotada en SPEC 15), y el `slug` es ASCII puro porque es segmento de URL de `/juego/[id]` y `/jugar/[id]`.
- **Sí:** rejilla de **20 × 15**, no los 24 × 18 del prototipo. Medido en el navegador, a 20 columnas la celda queda en **16,95 px** dentro del tubo de un móvil de 390 px y a 24 caería a ~14,1 px; 300 celdas siguen dejando sitio de sobra a la serpiente más larga que alguien alcance. El `CLAUDE.md` del prototipo ya deja escrito que ese número es el único que un port debe recalcular.
- **No:** mantener 24 × 18 «porque es lo que se jugó». El prototipo se juega en un canvas de escritorio sin tubo, sin scanlines y sin bandas: la medida que importa es la de dentro de `.crt-screen` en móvil, y es otra.
- **No:** bajar a 16 × 12 para igualar la celda de `BUSCAMINAS` (18,75 px). El suelo de 18 px de esa spec es un suelo de **objetivo táctil** — el dedo tiene que acertar una casilla —, y en `SERPIENTE` ninguna celda es nunca un objetivo: se conduce con cuatro teclas. Aquí el suelo es de legibilidad, y 192 celdas aprietan de más el recorrido de un snake.
- **Sí:** celda de 24 px lógicos, canvas 480 × 360. Es 4:3 exacto, así que el escenario no necesita modificador y la banda del juego encaja con la de los otros cuatro sin aritmética nueva.
- **Sí:** una vida. Coincide con la referencia y con tres de los cuatro juegos existentes. Un snake con vidas de sobra deja de tener tensión: el choque tiene que costar la partida.
- **Sí:** `niveles = null`, sin tope de nivel. El freno real es `TICK_MIN` (60 ms, alcanzado en el nivel 9), igual que `BUSCAMINAS` topa las minas y `ARKANOID` la velocidad de la bola. Inventar un techo de nivel sería inventar un final que el juego no tiene.
- **Sí:** `10 × nivel` por fruta. Hay progresión real de nivel, así que el marcador debe premiar llegar lejos — igual que `TETRIX`, `ARKANOID` y `BUSCAMINAS`. `ASTEROIDES` renunció al multiplicador justo por no tener niveles, que no es el caso aquí.
- **Sí:** nivel cada **cinco** frutas, recalculado desde `fruits` en vez de guardado aparte. Un campo `level` independiente puede desincronizarse de `fruits`; derivado, no.
- **Sí:** la partida **espera quieta al primer giro** (`started`), como la bola de `ARKANOID` espera pegada a la pala. Se descubrió jugándolo, no leyéndolo: la serpiente nace en el centro con nueve celdas de pista, así que cargar la página terminaba la partida en **1,35 s** con 0 puntos, sin que el jugador tocara nada — y dejaba los tres tests de comportamiento de §3.9 sin poder llegar a tiempo a su primera aserción, porque `signIn` + `goto` tarda más que eso. Es el único cambio de esta spec sobre lo que se aprobó en su primera redacción, y es el precedente del catálogo, no una invención.
- **No:** darle más pista arrancando en la columna 1 (18 celdas, 2,7 s). Duplica el margen pero no resuelve ninguno de los dos problemas: 2,7 s sigue siendo menos que un ciclo de Playwright, y un humano sigue perdiendo una partida por cargar una página.
- **No:** dejarlo arrancando solo «porque un snake nunca se detiene». Lo que nunca se detiene es una partida **empezada**; obligar a que empiece antes de que nadie mire no es el género, es un cronómetro.
- **Sí:** arrancar con cualquiera de las cuatro direcciones, incluida la repetida y la marcha atrás. Arrancar y girar son cosas distintas, y quien pulsa → al principio está pidiendo salir, no girar; si sólo arrancaran los giros válidos, → no haría nada y eso es un botón muerto en el único momento en que el jugador lo busca.
- **Sí:** entrada por **flanco, sin repetición al mantener**. Es la tercera clase de entrada del catálogo, distinta de la repetición a ~110 ms de `TETRIX` y del estado por fotograma de `ASTEROIDES`/`ARKANOID`, y es la correcta: la serpiente ya se mueve sola, así que mantener una flecha no tiene ningún significado que inventar. Una repetición sólo llenaría la cola de rumbos que `enqueueDir` ya descarta por repetidos.
- **Sí:** **cola** de giros con tope 2, nunca una sola ranura. Con una ranura, dos giros dentro del mismo paso se validan los dos contra un `state.dir` que aún no ha avanzado, y la combinación puede resolverse en una inversión que mata a la serpiente por su propio cuello. Es el bug clásico del género y es invisible hasta que un jugador rápido lo encuentra; tiene criterio de aceptación y test propios.
- **No:** tope de cola mayor que 2. Tres o más giros pendientes dejan de ser intención del jugador y se vuelven inercia: pulsas y la serpiente ejecuta un rumbo que ya no querías.
- **Sí:** validar el giro contra el **último elemento de la cola**, no contra `state.dir`. Validar contra `dir` es exactamente el error que la cola existe para evitar.
- **Sí:** excluir el último segmento de la colisión cuando el paso no come. La cola abandona su celda en ese mismo paso: no excluirla mataría al jugador por seguirse a distancia cero, que es justo la maniobra buena.
- **Sí:** muro mortal, sin bordes que envuelvan. Es la referencia y es la mitad de la tensión del juego; con wrap, la rejilla deja de tener forma.
- **Sí:** sin estado de victoria. La puntuación es monótona y el nivel no tiene techo — es lo que mantiene el marcador abierto, y es precisamente el gate que el `game-planner` usó para rechazar `ALMACÉN`.
- **Sí:** fruta elegida de la **lista de celdas libres**. El muestreo con rechazo degenera a medida que la serpiente ocupa la rejilla; recorrer las libres no, y 300 celdas es una lista barata.
- **Sí:** columna lateral para el escenario — tablero a la izquierda, `GIRO` y la cruceta en `.snake-side` a la derecha, patrón de `BUSCAMINAS` (`.minas-stage`/`.minas-side`). Decisión revisada durante la implementación, a petición explícita, sobre la redacción original de esta spec (que adoptaba el patrón de franja debajo de `ARKANOID`). La serpiente puede estar en cualquier celda, incluida la última fila, así que superponer mandos sobre el tablero sigue sin ser opción — el error que SPEC 15 §8 corrigió y que SPEC 20 §6 decidió no repetir —, pero entre las dos formas de evitarlo se prefiere la que ya usa `BUSCAMINAS`, el otro juego con el mismo problema (cursor en cualquier celda), para que los dos se lean como la misma familia de pantalla.
- **No:** patrón de `ARKANOID` (franja de mandos debajo del tablero). Era la decisión original y es técnicamente válida — el tablero nativo (480×360) cabe de sobra en cualquiera de los dos repartos —, pero deja a `SERPIENTE` sin parecido con `BUSCAMINAS`, que resuelve el mismo problema de forma distinta sin necesidad: no hay ninguna restricción de espacio que obligue a diferenciarlos.
- **Sí:** `screen: ""` como `ARKANOID`. El tablero ya es el 4:3 del tubo y, además, **SPEC 21 eliminó todas las reglas `.crt-screen.<modificador>`**: añadir un valor nuevo ahí sería declarar un gancho sin CSS detrás.
- **Sí:** los dos botones del mando giran 90° en **relativo** (A derecha, B izquierda) en vez de quedar inertes. Mismo argumento con el que SPEC 23 revivió la `B` de `TETRIX`: un pulgar apoyado en los círculos necesita algo que hacer, y `SERPIENTE` sería el primer juego con los dos muertos. Además es cómo se juega un snake con dos botones, así que no es una mecánica inventada.
- **No:** un solo botón que «cambie de eje». Un botón cuyo efecto depende del rumbo es el que peor se lee de las tres opciones: con rumbo `→`, ¿sube o baja?
- **No:** dejar los dos botones inertes. Legal (`ASTEROIDES` y `ARKANOID` tienen uno), pero deja el mando con dos huecos justo donde descansa el pulgar, y SPEC 23 ya consideró que un hueco era suficiente motivo para cambiarlo.
- **Sí:** `release` del `PadHandle` como no-op. Es la primera vez que un motor no tiene nada que parar al soltar, y es coherente con la regla de SPEC 21: el motor recibe `press`/`release` y decide qué significan; aquí soltar no significa nada porque nada repite.
- **Sí:** la banda `.screen-legend` reservada con `LEYENDA` centrado, como `TETRIX`. `SERPIENTE` no tiene nada que explicar — ni power-ups ni contadores — y la regla de SPEC 21 es que **todos** los juegos reservan la banda, para que los cinco midan lo mismo.
- **No:** pintar nivel o longitud en la leyenda. El nivel ya lo pintan el HUD y `.screen-stats`; repetirlo sería la mentira duplicada que el contrato prohíbe, y la longitud no es información que el jugador necesite leer — la ve.
- **No:** portar el panel DOM lateral del prototipo (`NIVEL`/`LONGITUD`). Existe porque el prototipo no tiene HUD; aquí hay uno común y es el que manda.
- **No:** overlay de fin de partida propio (el `drawOverlay` de la referencia). El panel dentro del tubo de SPEC 22 cubre exactamente ese papel, con el estilo de la casa, y sobre él cuelga la rama de guardado.
- **Sí:** `dt` acotado a 200 ms antes de acumular. Sin eso, volver de una pestaña en segundo plano drena una ráfaga de pasos que el jugador no vio y lo mata sin haber tocado nada. `ARKANOID` resolvió el mismo problema acotando a 50 ms; aquí el paso es mucho más largo, así que el techo también.
- **Sí:** `perifericos = array['teclado']`. A diferencia de `ARKANOID` (arrastra la pala) y `BUSCAMINAS` (señala una celda), aquí el ratón no haría nada que el teclado no haga: no se apunta, se conduce. Declarar `raton` sería relleno.
- **Sí:** `dificultad = 1`. Es el único valor libre del rango y es honesto: cuatro teclas, una regla, y los primeros niveles son lentos. Es el más bajo del catálogo (`BUSCAMINAS` 2, `ARKANOID` 3, `TETRIX` 4, `ASTEROIDES` 5), y eso es correcto.
- **Sí:** `color = 'green'`, reutilizado. Los cuatro tokens del `CHECK` están tomados, así que el quinto juego reutiliza por fuerza; `green` es el de `BUSCAMINAS`, que es `PUZZLE`, y siendo `SERPIENTE` de `ARCADE` los dos verdes nunca comparten un filtro de categoría. Además es el color del juego, que ayuda.
- **No:** ampliar el `CHECK` de `color` con un token nuevo. Sería una migración de esquema y un token de tema para un problema que la disciplina de categorías ya resuelve.
- **Sí:** `.cover-snake` y los prefijos `.snake-*`, no `cover-serpiente`/`.serpiente-*`. Las cuatro portadas existentes son `cover-tetro`, `cover-rocas`, `cover-bricks` y `cover-minas` — fichas cortas, ninguna es el `slug` entero — y los escenarios son `.tetris-`/`.rocks-`/`.ark-`/`.minas-`. El `game-planner` había propuesto `cover-serpiente`; se corrige aquí a sabiendas, porque el ledger describe candidatos y es esta spec la que fija la fila real.
- **Sí:** `.cover-snake` dibujada desde cero en CSS. No hay ninguna clase huérfana que reciclar (igual que `BUSCAMINAS`) y el patrón «captura real + respaldo en CSS» está establecido en los cuatro.
- **No:** sembrar el azar de la fruta para tests deterministas. Ninguna aserción depende de dónde caiga: un giro cambia el lienzo, la serpiente avanza sola y la puntuación se comprueba conduciendo hasta una fruta. `ARKANOID` necesitaba muros reproducibles; aquí no hay nada que el determinismo resolviera.
- **No:** conducir tocando el lienzo (deslizar, o tocar el lado al que girar). La cruceta del mando ya es la vía táctil y un gesto sobre el canvas es una mecánica nueva no pedida. El lienzo tampoco lleva `touch-action: none`, porque no hay arrastre que proteger.
- **No:** obstáculos, muros interiores, frutas especiales o power-ups. La referencia no los tiene y no se pidieron. `ARKANOID` ganó los suyos en una spec propia (SPEC 24), que es el precedente de cómo se añade eso.
- **No:** dos jugadores, aunque `VERSUS` y `jugadores = 2` sigan vacíos. `public.scores` sólo sabe acreditar un `auth.uid()`, que es exactamente el gate por el que el `game-planner` rechazó `DUELO`.
- **No:** persistir nada más allá de `save_score`. Automático en cuanto existan la fila y la entrada de `ENGINES`; no hay nada que escribir, igual que en las cuatro specs anteriores.

---

## 7. Riesgos

| Riesgo                                                                                                                                                                               | Mitigación                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El bug del cuello: dos giros dentro de un mismo paso resuelven en una inversión y la serpiente se mata sola. No se ve en una revisión de código y sólo aparece con un jugador rápido | La cola de giros (§3.2) es parte del diseño, no una optimización; tiene criterio de aceptación propio y un test dedicado (§3.9, punto 5) que pulsa dos flechas sin espera dentro de un paso de 150 ms.                                                                |
| La celda de ~14,6 px en móvil resulta ilegible en un tubo con scanlines y el juego no se ve                                                                                          | Se mide a mano a 390 × 844 antes de cerrar el paso 5, como `CLAUDE.md` exige para cualquier cambio visual. Si falla, el ajuste es `COLS`/`ROWS` (16 × 12 → 18,3 px), una constante del motor, no un cambio de arquitectura.                                           |
| El paso de 60 ms del nivel 9 en adelante resulta injugable con la latencia de un mando táctil, no sólo difícil                                                                       | `TICK_MIN` es una sola constante y la cola de giros ya absorbe una pulsación adelantada. Se comprueba jugando hasta el nivel 9+ en el paso 4, que es lo que la Fase 2 del prototipo ya verificó una vez.                                                              |
| Las dos listas literales de `app/globals.css` (`:2807` y `:2859`) se olvidan y la banda del juego mide distinto en móvil, o la cruceta se queda encima del mando                     | Son criterio de aceptación explícito y las vigila un test que ya existe: el que compara el tamaño de los escenarios de todos los juegos de `JUEGOS` con un píxel de margen (`tests/screens.spec.ts:1687`).                                                            |
| Añadir `"serpiente"` a `JUEGOS` mete el juego en cinco tests de golpe y uno falla por un detalle del mando que no se previó                                                          | Los cinco están escritos contra el contrato, no contra un juego: lo que comprueban es que el tubo no tenga botones visibles, que la silueta del mando sea la misma y que la banda mida igual. Si uno falla, el fallo es real y es del contrato.                       |
| El test de «comer sube la puntuación» resulta frágil porque conducir hasta una fruta aleatoria depende del azar                                                                      | §3.9 ya deja la alternativa escrita y la decisión pospuesta al paso 6: exponer la fruta por un `data-*` del lienzo. Lo que **no** se hace es sembrar el azar del motor para esto.                                                                                     |
| El bucle sigue vivo detrás del panel del tubo y la serpiente muere mientras el jugador mira el menú                                                                                  | `paused={paused \|\| over \|\| menu}` ya congela el motor (SPEC 22) y el `useEffect` del bucle lo cancela: el criterio de aceptación lo comprueba pidiendo que el lienzo quede **idéntico** un segundo, no sólo que aparezca el cartel.                               |
| Volver de una pestaña en segundo plano drena una ráfaga de pasos y mata la partida sin que nadie haya tocado nada                                                                    | `dt` acotado a 200 ms en el acumulador (§3.3), con criterio de aceptación propio. El prototipo ya lo trae resuelto y se porta tal cual.                                                                                                                               |
| El verde reutilizado de `BUSCAMINAS` confunde las dos tarjetas en `/biblioteca`                                                                                                      | Nunca comparten un filtro de categoría (`PUZZLE` vs `ARCADE`), y bajo `TODOS` las separan la portada, el título y la ficha. Era la condición con la que el `game-planner` admitió la reutilización.                                                                   |
| Las capturas regeneradas de `home`/`biblioteca` consagran una regresión visual                                                                                                       | Se revisan a mano en los dos anchos antes de regenerar y el diff queda acotado a esos ficheros — regla de `CLAUDE.md`.                                                                                                                                                |
| En el proyecto remoto el `created_at` de cada migración es realmente distinto, así que el orden del catálogo en producción podría no coincidir con el local                          | En los dos casos `SERPIENTE` es la migración más reciente, así que entra última en los dos. Lo que sí difiere es el orden relativo de los tres primeros; no hay test ni aserción que dependa de eso más allá de la primera `.mini-card`, que sigue siendo `arkanoid`. |
| Un sexto juego vuelve a romper los recuentos y las listas de la suite                                                                                                                | §1.4 deja escrito qué deriva del tamaño del catálogo y qué no. No se añade abstracción para evitarlo: son tablas de datos de cinco filas.                                                                                                                             |
