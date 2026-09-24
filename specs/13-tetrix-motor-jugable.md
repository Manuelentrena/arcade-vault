# SPEC 13 — TETRIX: primer juego con motor real dentro del CRT

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 04
> **Fecha:** 2026-09-24
> **Objetivo:** Sustituir `BLOQUE BUSTER` y `CAÍDA` por un único `TETRIX` jugable de verdad, con el motor del Tetris de `references/started-games/03-tetris/` portado a React y encajado dentro de la pantalla CRT que ya existe, sin tocar el HUD común ni persistir ninguna puntuación.

---

## 1. Punto de partida

### 1.1 Lo que hay hoy en el reproductor

`components/game-player.tsx` (171 líneas) no tiene motor. Un `setInterval` de 220 ms sube la puntuación con `10 + Math.random() * 90` y sube de nivel cada 2500 puntos; las vidas se inicializan a 3 y **nunca bajan**. Dentro de `.crt-screen` se pinta `.game-arena`: una rejilla en perspectiva, tres cuadrados enemigos y una nave triangular, todo CSS (`app/globals.css:1325-1400`).

Lo que **sí** está resuelto y esta spec no toca:

| Pieza existente                                                                | Dónde                                                     | Papel en esta spec                                          |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| HUD superior: Jugador · Puntuación · Vidas ♥ · Nivel                           | `.player-hud` / `.hud-stat` (`app/globals.css:1191-1231`) | Se reutiliza **tal cual**. El motor le entrega los números. |
| Botones `PAUSA` / `FIN` / `SALIR`                                              | `.hud-actions`                                            | Se reutilizan tal cual. Son los únicos mandos de pausa.     |
| Overlay `EN PAUSA` dentro de la pantalla                                       | `components/game-player.tsx`                              | Se reutiliza tal cual.                                      |
| Modal `FIN DEL JUEGO` con input de iniciales y `GUARDAR PUNTUACIÓN` decorativo | `.modal-bd` / `.modal`                                    | Se reutiliza tal cual. Sigue sin persistir nada.            |
| Marco CRT, scanlines, `.crt-bottom`                                            | `.crt` / `.crt-screen`                                    | Se reutiliza. El tablero vive **dentro** de `.crt-screen`.  |

### 1.2 Lo que trae la referencia

`references/started-games/03-tetris/game.js` (332 líneas, `'use strict'`, sin módulos) es un Tetris completo sobre `<canvas>`: tablero 10 × 20, 7 tetrominós más una octava pieza no estándar («tuerca», índice 8), rotación con _wall kicks_ `[0, ±1, ±2]`, ghost piece a `globalAlpha = 0.2`, vista `NEXT`, soft/hard drop, `LINE_SCORES = [0,100,300,500,800] × nivel`, nivel `floor(lineas/10) + 1`, `dropInterval = max(100, 1000 − (nivel−1) × 90)` y bucle con `requestAnimationFrame`.

Tres cosas de la referencia **no encajan** con este proyecto y se descartan (§6): el toggle claro/oscuro con `localStorage` (la app es oscura por diseño y la sesión no vive en `localStorage`), el panel lateral con `SCORE/LINES/LEVEL` y la lista de controles (el HUD superior ya cumple ese papel), y su propio overlay de `PAUSA`/`GAME OVER` con botón `Reiniciar` (el modal del proyecto ya lo cubre).

### 1.3 El solapamiento del catálogo

`lib/games.ts` tiene ocho juegos. Dos son el mismo juego: `bloque-buster` (ARCADE, rompeladrillos) y `caida` (PUZZLE, «piezas geométricas descienden… limpia líneas… la velocidad aumenta cada 10 líneas») — que ya es un Tetris descrito con otro nombre. La decisión tomada: **borrar `bloque-buster` y convertir `caida` en `tetrix`**. El catálogo baja a **siete** juegos y no queda ninguna ficha duplicada.

### 1.4 Efectos colaterales medidos del cambio de catálogo

No son opcionales ni sorpresas: se listan aquí porque el plan tiene que cubrirlos.

| Qué                                                | Por qué cambia                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GAMES[0]` pasa de `bloque-buster` a `tetrix`      | `components/hall-of-fame.tsx:18` usa `GAMES[0].id` como pestaña por defecto: `/salon` abre en otra tabla.                                                                   |
| Las tablas de `tetrix` no son las de `caida`       | `detailSeed`/`hallSeed` (`lib/scores.ts`) derivan de **`gameId.length`**: `"caida"` = 5 → `"tetrix"` = 6. Cambian las 12 filas del salón y las 10 del detalle de ese juego. |
| `app/page.tsx:15` pinta `GAMES.slice(0, 6)`        | Con siete juegos el corte es otro: entra `ranaria` y sale `bloque-buster`. La portada cambia.                                                                               |
| `.hall-tabs .chip` pasa de 8 a 7                   | `tests/screens.spec.ts:655`.                                                                                                                                                |
| `.card` y `.cover-bg` pasan de 8 a 7               | `tests/screens.spec.ts:324`, `:325`, `:359`.                                                                                                                                |
| El chip `PUZZLE` deja `TETRIX`, no `CAÍDA`         | `tests/screens.spec.ts:348`.                                                                                                                                                |
| Dos tests de auth navegan a `/jugar/bloque-buster` | `tests/screens.spec.ts:560` y `:597`: ese id deja de existir.                                                                                                               |
| Seis capturas de referencia                        | `home-*`, `biblioteca-*` y `salon-*` en los dos proyectos. `detalle-*` y `reproductor-*` usan `serpentina` (sin tocar), y `auth-*`/`acerca-*` no dependen del catálogo.     |
| Prosa desmentida                                   | `README.md:9-10`, `:223`, `:271` («los ocho juegos son decorativos», «no hay motor de juego») y la sección «Project» de `CLAUDE.md`.                                        |

---

## 2. Alcance

**Dentro:**

- `lib/games.ts`: borrado de `bloque-buster`, renombrado de `caida` a `tetrix` con título, `short` y `long` reescritos.
- Motor de Tetris puro y sin DOM en `lib/tetris.ts`.
- Componente de juego `components/tetris-game.tsx`: `<canvas>` del tablero, `<canvas>` del `NEXT`, cruceta táctil, bucle `requestAnimationFrame`, teclado.
- Bifurcación por `game.id` en `components/game-player.tsx`: `tetrix` monta el motor, los otros seis siguen con `.game-arena`.
- Una sola vida — un corazón en el HUD — y techo de nivel 10: el _top-out_ abre directamente el modal que ya existe.
- Siete tokens de color de pieza en `:root` y el CSS del escenario dentro de `.crt-screen`.
- Portada en imagen: captura real del juego en `public/juegos/tetrix.png`, campo `image?` en `Game` y su uso en la tarjeta, el carril de la portada y la ficha de detalle.
- Modal de fin de partida: nombre no editable y bifurcación invitado / cuenta, con vuelta desde `/auth` por la URL.
- Ajuste de `tests/screens.spec.ts` (recuentos, título del chip PUZZLE, rutas de los tests de auth) y cinco tests nuevos sin captura: tres de TETRIX y dos del modal de invitado.
- Regeneración de las seis capturas de referencia afectadas, en los dos proyectos.
- `README.md` (prosa + índice de specs) y la sección «Project» de `CLAUDE.md`.

**Fuera:**

- **Persistir puntuaciones.** Ni con cuenta ni volviendo de `/auth`: no hay tabla, ni endpoint, ni escritura, y los leaderboards siguen saliendo del LCG de `lib/scores.ts`. El invitado que entra recupera su puntuación en pantalla y la ve marcada como guardada, que es cuanto se puede prometer sin base de datos. La persistencia de verdad es una spec propia.
- **Los otros seis juegos.** Siguen decorativos, con la escena CRT animada y el temporizador de puntuación.
- **`best` y `plays` de la ficha.** Se mantienen los valores que tenía `caida` (184 220 / «31.8K»). Son datos falsos del catálogo, no marcas reales del motor.
- **Octava pieza «tuerca», contador de `LÍNEAS` en el HUD, toggle claro/oscuro, panel lateral de la referencia.** Descartados en §6.
- **Sonido, vibración, _hold piece_, bolsa de 7 (_7-bag_), _lock delay_, SRS completo.** El azar es `Math.random()` pieza a pieza y los _wall kicks_ son los `[0, ±1, ±2]` de la referencia.
- **Cambios en el HUD.** Ni un bloque nuevo, ni un botón nuevo: es común a los siete juegos.

---

## 3. Diseño

### 3.1 Catálogo (`lib/games.ts`)

Se borra el objeto `bloque-buster` completo. El objeto `caida` queda:

```ts
{
  id: "tetrix",
  title: "TETRIX",
  short: "Encaja los tetrominós y limpia líneas sin llegar al techo.",
  long: "Siete piezas de neón caen sobre una rejilla de 10 × 20. Rótalas, deslízalas y encájalas para limpiar líneas: cada diez líneas sube el nivel y las piezas caen más rápido, hasta el nivel 10. Una sola vida: si el montón llega al techo, la partida termina y empiezas de nuevo.",
  cat: "PUZZLE",
  cover: "cover-tetro",
  color: "magenta",
  best: 184220,
  plays: "31.8K",
}
```

La ficha estrena además **portada en imagen**: `image: "/juegos/tetrix.png"`, una captura real de la partida (la pantalla CRT entera, 4:3, con el montón de piezas, los mandos y el `SIGUIENTE`), tomada del juego ya terminado y guardada en `public/juegos/`. `Game` gana un campo opcional `image?: string`; cuando existe, sustituye a la portada dibujada en CSS en los tres sitios que pintan portadas — la tarjeta de `/biblioteca`, el carril de la portada y la ficha de `/juego/[id]` — mediante `next/image` con `fill` y `object-fit: cover` (`.cover-shot`). `cover-tetro` (`app/globals.css:898`) se conserva como respaldo del campo vacío y porque los otros seis juegos siguen usando sus clases. La posición dentro del array es la primera, la que dejó `bloque-buster`, así que `GAMES[0]` es `tetrix` y `/salon` abre en su pestaña.

`CATS`, `GameCat`, `GameColor` y `getGame()` no cambian. `ARCADE` sigue teniendo juegos (`serpentina`, `gloton`, `ranaria`), así que ningún chip de categoría se queda vacío.

### 3.2 El motor (`lib/tetris.ts`)

Módulo puro: sin `document`, sin `window`, sin React. Es lo que permite razonar sobre las reglas sin arrancar un navegador.

```ts
export const COLS = 10;
export const ROWS = 20;
/** Una sola vida: el top-out termina la partida. */
export const LIVES = 1;
/** Techo de nivel: a partir de las 90 líneas el nivel se queda en 10. */
export const MAX_LEVEL = 10;

/** 0 = celda vacía; 1–7 = índice de tetrominó. */
export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Shape = number[][];
export type Piece = { type: number; shape: Shape; x: number; y: number };

export type TetrisState = {
  board: Cell[][];
  current: Piece;
  next: Piece;
  score: number;
  lines: number;
  level: number;
  lives: number;
  /** true tras el top-out: el reproductor abre el modal. */
  over: boolean;
};

export function createState(): TetrisState;
export function collide(
  board: Cell[][],
  shape: Shape,
  ox: number,
  oy: number,
): boolean;
export function rotateCW(shape: Shape): Shape;
export function ghostY(state: TetrisState): number;
export function dropIntervalMs(level: number): number;

/** Cada acción devuelve el estado mutado in situ; el componente lo guarda en un ref. */
export function move(state: TetrisState, dx: -1 | 1): void;
export function rotate(state: TetrisState): void;
export function softDrop(state: TetrisState): void;
export function hardDrop(state: TetrisState): void;
export function tick(state: TetrisState): void;
```

Reglas, calcadas de la referencia (§1.2):

- `PIECES` son los siete tetrominós estándar (I, O, T, S, Z, J, L) como matrices cuadradas. La octava pieza queda fuera.
- `rotate()` prueba los desplazamientos `[0, -1, 1, -2, 2]` y aplica el primero que no colisione; si ninguno cabe, el giro se descarta.
- Puntuación: `[0, 100, 300, 500, 800][lineas] × nivel`, `+2` por celda en hard drop, `+1` por fila en soft drop.
- `level = min(MAX_LEVEL, floor(lines / 10) + 1)`; `dropIntervalMs(level) = max(100, 1000 − (level − 1) × 90)`. La fórmula es la de la referencia; lo que cambia es el techo. Con el nivel tope en 10 el intervalo mínimo es **190 ms** y el multiplicador de puntuación se queda en `× 10` a partir de las 90 líneas — el `max(100, …)` deja de ser alcanzable, y se conserva sólo porque es la fórmula de la referencia y documenta el suelo.
- `tick()` baja la pieza una fila o, si no puede, fija (`merge` + `clearLines` + `spawn`).

**Vidas — la única regla que no está en la referencia.** `lives` arranca en `LIVES = 1` y sólo tiene un camino: cuando la pieza recién generada ya colisiona (_top-out_), `lives` pasa a `0` y `over` a `true`. El componente para el bucle, avisa al reproductor y el modal `FIN DEL JUEGO` se abre con la puntuación final; `JUGAR DE NUEVO` remonta el motor desde cero (§3.3, punto 7).

No hay limpieza de tablero ni continuación de partida: con una vida, el top-out **es** el fin del juego. El campo `lives` se conserva en el estado, y no se sustituye por un booleano, porque es lo que el HUD pinta como corazones y lo que hace que el mismo `onRun` sirva para los siete juegos.

Mutación in situ y estado en un `useRef`, no en `useState`: a 60 fps un `setState` por fotograma reconciliaría React 60 veces por segundo para pintar en un canvas que React no gestiona.

### 3.3 El componente (`components/tetris-game.tsx`)

Cliente (`"use client"`). Contrato con el reproductor:

```ts
type TetrisGameProps = {
  /** Lo controla el botón PAUSA del HUD. Con true, el bucle no avanza. */
  paused: boolean;
  /** El motor empuja aquí score / lives / level cuando cambian. */
  onRun: (run: { score: number; lives: number; level: number }) => void;
  /** Top-out: el reproductor abre el modal FIN DEL JUEGO. */
  onOver: () => void;
};
```

Estructura interna:

1. **Bucle.** `requestAnimationFrame` acumula `dt` contra `dropIntervalMs(level)`; llama a `tick()` cuando toca y a `draw()` en cada fotograma. Se cancela en el `cleanup` del efecto, cuando `paused` pasa a `true` y cuando `over` se pone a `true`. `performance.now()` se reinicia al reanudar para que la pausa no acumule un salto de caída.
2. **Aviso al HUD.** `onRun` se llama sólo cuando `score`, `lives` o `level` cambian respecto al último aviso, no cada fotograma.
3. **Canvas del tablero.** Tamaño lógico `COLS × ROWS × BLOCK` (300 × 600 con `BLOCK = 30`), multiplicado por `devicePixelRatio` en el atributo del canvas y escalado por CSS. Se pinta: rejilla (`var(--line)`), bloques fijados, ghost a `globalAlpha = 0.2` y pieza actual. Cada bloque lleva la banda superior `rgba(255,255,255,0.12)` de la referencia.
4. **Canvas del `NEXT`.** 4 × 4 celdas y el mismo `drawBlock`. La pieza se centra por la **caja de sus celdas llenas**, no por el tamaño de la matriz: las matrices llevan filas y columnas vacías — la I ocupa una fila de una matriz 4 × 4 — y centrar por la matriz deja casi todas las piezas arriba a la izquierda. El desplazamiento se calcula con decimales, así que una pieza de ancho impar queda centrada de verdad.
5. **Teclado.** `keydown` en `window`: `←`/`→` mover, `↑` y `X` rotar, `↓` soft drop, `Espacio` hard drop (con `preventDefault()`, o la página se desplaza), `P` pausa — que no toca estado local: llama al mismo `onPause` que el botón del HUD, para que no existan dos verdades sobre la pausa.
6. **Cruceta táctil.** Cinco botones dentro de la pantalla (§3.4): rotar, izquierda, derecha, soft drop y hard drop. `onPointerDown` dispara la acción; izquierda, derecha y soft drop se repiten cada 110 ms mientras se mantiene pulsado, y el repetidor se cancela en `pointerup`, `pointercancel` y `pointerleave`. Cada botón lleva su `aria-label` en español.
7. **Reinicio.** No hay lógica de reinicio dentro: `JUGAR DE NUEVO` del modal cambia una `key` en el reproductor y React remonta el componente con estado nuevo. Un camino menos que mantener.

Los colores de pieza se leen **una vez al montar** con `getComputedStyle(document.documentElement).getPropertyValue("--piece-i")` y compañía — la misma técnica que la referencia usa para `--grid-line` — con un array de hex literales como respaldo si el valor viene vacío. El CSS es la única fuente de verdad de la paleta; el respaldo sólo evita un tablero invisible si el token desaparece.

### 3.4 Reparto dentro de `.crt-screen`

El tablero a la izquierda; a la derecha una columna con los mandos arriba y el `NEXT` **abajo, alineado con el borde inferior del tablero**. Cada bloque de la columna lleva su título en la misma tipografía y tamaño: `MOVIMIENTO`, `BAJAR` y `SIGUIENTE`. **Nada de pausa dentro de la pantalla**: la pausa es el botón del HUD, y dentro sólo aparece el overlay `EN PAUSA` que ya existe.

```
┌─ .crt-screen.tetris ───────────────────────┐
│ ┌──────────┐                               │
│ │          │   MOVIMIENTO                  │
│ │          │      [↻]                      │
│ │ tablero  │   [←] [↓] [→]                 │
│ │ 10 × 20  │                               │
│ │          │   BAJAR                       │
│ │          │   [   ▼▼   ]                  │
│ │          │   SIGUIENTE                   │
│ │          │   ┌─────────┐                 │
│ └──────────┘   └─────────┘  ← mismo borde  │
└────────────────────────────────────────────┘
```

Clases nuevas en `app/globals.css`, junto al bloque `/* fake in-screen game */` y con un comentario que diga que ése es el escenario **real**:

- `.tetris-stage` — `position: absolute; inset: 0;` `display: flex;` `gap: clamp(8px, 2%, 20px);` `align-items: center; justify-content: center;` `padding: clamp(8px, 2%, 18px);` fondo negro con el mismo `radial-gradient` que `.game-arena` para no romper la continuidad visual del tubo.
- `.tetris-board` — `height: 100%; aspect-ratio: 1 / 2; width: auto;` `image-rendering: pixelated;` `display: block;`. La altura manda: el tablero siempre llena la pantalla en vertical y el ancho sale de la proporción 10 × 20.
- `.tetris-side` — columna, `width: clamp(84px, 22%, 180px)`, `align-self: stretch` y `justify-content: flex-end`: se estira a la altura del tablero y apoya su contenido abajo, que es lo que deja `SIGUIENTE` al nivel del borde inferior del tablero y los mandos justo encima.
- `.tetris-block` — cada bloque titulado de la columna: título arriba, contenido debajo, ancho completo.
- `.tetris-side .l` — el título, en `var(--pixel)` a 8px con `letter-spacing: 0.16em` y color `var(--ink-faint)`. Los tres (`MOVIMIENTO`, `BAJAR`, `SIGUIENTE`) comparten regla: son el mismo elemento repetido, no tres estilos parecidos.
- `.tetris-pad` — rejilla de 3 columnas con la cruceta; botones cuadrados con `.btn`, `touch-action: manipulation` y `user-select: none`. El hard drop ya no vive en esta rejilla: es el contenido del bloque `BAJAR`, a ancho completo.
- `.crt-screen.tetris` — modificador que **no cambia nada en escritorio** y que por debajo de 720px pasa el `aspect-ratio` de `4 / 3` a `3 / 4`.

El porqué del modificador, con las cuentas del viewport móvil de la suite (390px):

| Tramo                                                     | Valor                                           |
| --------------------------------------------------------- | ----------------------------------------------- |
| Viewport                                                  | 390px                                           |
| `.av-player` — `padding: 0 16px` (`app/globals.css:1824`) | 358px                                           |
| `.crt` — `padding: 24px`                                  | 310px de pantalla útil                          |
| Altura con `4 / 3`                                        | 232px → tablero de **116px** → 11.6px por celda |
| Altura con `3 / 4`                                        | 413px → tablero de **206px** → 20.6px por celda |

Con 11.6px por celda el juego se ve pero no se juega. El modificador sólo se aplica cuando la pantalla hospeda el tablero, así que la escena decorativa de los otros seis juegos conserva su `4 / 3` y su captura de referencia intacta.

### 3.5 Tokens de color de pieza

Siete colores hacen falta y la paleta tiene cuatro neones. Cuatro piezas los reutilizan y las otras tres son mezclas de la misma familia, en `:root` de `app/globals.css`, junto a los acentos:

```css
/* piezas de TETRIX — los 4 neones más tres mezclas de la misma familia */
--piece-i: #00f5ff; /* = --cyan */
--piece-o: #f5ff00; /* = --yellow */
--piece-t: #ff006e; /* = --magenta */
--piece-s: #00ff88; /* = --green */
--piece-z: #ff5a1f; /* ámbar: entre magenta y amarillo */
--piece-j: #8a5cff; /* violeta: entre cian y magenta */
--piece-l: #00b3ff; /* azul eléctrico: entre cian y violeta */
```

No entran en el bloque `@theme inline`: nada las consume como utilidad de Tailwind, las lee el canvas con `getComputedStyle`. Los tres colores mezclados se verifican a ojo en el navegador antes de regenerar nada — el par a vigilar es `--piece-i` (cian) contra `--piece-l` (azul), que es el mismo par que la referencia ya tenía entre la I y la J.

### 3.6 Bifurcación en `components/game-player.tsx`

Lo que cambia y lo que no:

```
Se mantiene: HUD entero, PAUSA / FIN / SALIR, overlay EN PAUSA,
             modal FIN DEL JUEGO con input y GUARDAR PUNTUACIÓN decorativos,
             normalizeName(), displayName(), .crt, .crt-bottom.

Se añade:    const playable = game.id === "tetrix";
             runKey (number) para remontar el motor al reiniciar.

Cambia:      el setInterval decorativo se salta cuando playable es true.
             dentro de .crt-screen:
               playable ? <TetrisGame key={runKey} … /> : <div className="game-arena" …>
             .crt-screen recibe la clase "tetris" cuando playable.
             FIN pone over a true y, con el motor montado, el efecto del bucle
             se desmonta con él: no queda ningún rAF vivo detrás del modal.
             JUGAR DE NUEVO incrementa runKey además de lo que ya hacía.
```

**Modal de fin de partida.** El nombre deja de ser editable: se pinta el de la sesión (`displayName(user)`) en un bloque `.modal-player`, sin `<input>` ni `normalizeName()`. Y el guardado se bifurca por tipo de sesión:

| Quién juega                       | Qué ve en el modal                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Cuenta de verdad (correo u OAuth) | `GUARDAR PUNTUACIÓN`, decorativo como siempre: marca `▸ PUNTUACIÓN GUARDADA_` y no escribe nada.                         |
| Invitado (`user.isGuest`)         | Aviso de que hace falta entrar con Google, GitHub o correo, y `INICIAR SESIÓN PARA GUARDAR` en lugar del botón anterior. |

El botón del invitado lleva la partida a `/auth` y vuelve con ella: `router.push("/auth?next=" + encodeURIComponent("/jugar/tetrix?puntuacion=<score>&nivel=<level>"))`. La puntuación viaja **en la URL**, no en `sessionStorage`: así la resuelve el servidor en `app/jugar/[id]/page.tsx` (que valida los dos enteros antes de pasarlos como prop `restored`), no hace falta ningún efecto que la rescate tras hidratar y no hay desajuste de hidratación. Al volver, si la sesión ya **no** es de invitado, el modal se abre con esa puntuación y marcada como guardada; `JUGAR DE NUEVO` limpia la URL con `router.replace`.

Sigue sin persistirse nada: no hay tabla, ni endpoint, ni escritura. Lo que el flujo arregla es la promesa — antes un invitado podía «guardar» y ahora se le dice la verdad: primero hay que tener cuenta. La persistencia real es una spec aparte.

Un detalle del motor: con una partida recuperada el componente se monta de cero detrás del modal y su primer aviso (`0` puntos) pisaría la puntuación recuperada, así que `onRun` se ignora hasta que el jugador pulsa `JUGAR DE NUEVO`.

Las vidas del HUD pasan a venir del motor a través de `onRun`: en `TETRIX` es **un** corazón, que desaparece con el top-out en el mismo instante en que se abre el modal. Para los otros seis juegos siguen clavadas a 3, exactamente como hoy. `.hud-stat.lives` ya cubre el caso de cero sin tocar nada: `"♥ ".repeat(0)` cae en el `|| "—"` que `components/game-player.tsx` ya tiene escrito.

### 3.7 Tests

**Arreglos obligados** (§1.4), en `tests/screens.spec.ts`:

| Línea            | Cambio                                       |
| ---------------- | -------------------------------------------- |
| 324, 325         | `toHaveCount(8)` → `toHaveCount(7)`          |
| 348              | `"CAÍDA"` → `"TETRIX"`                       |
| 359              | `toHaveCount(8)` → `toHaveCount(7)`          |
| 655              | `toHaveCount(8)` → `toHaveCount(7)`          |
| 560-567, 597-605 | `/jugar/bloque-buster` → `/jugar/serpentina` |

`serpentina` y no `tetrix` en los tests de auth a propósito: lo que prueban es el proxy y la vuelta al juego tras iniciar sesión, y no tiene sentido arrancar un bucle de 60 fps de fondo mientras se comprueba una redirección.

**Tests nuevos**, en un `describe` propio y sin captura de pantalla — nada que dependa de qué pieza salga:

1. **Arranque.** En `/jugar/tetrix`: existen `.tetris-board` y el canvas del `NEXT`, el HUD marca `Puntuación 0`, **un** `♥` y `Nivel 01`. Los cuatro botones de la cruceta más el de caída son visibles y la columna lleva sus tres títulos en orden — `MOVIMIENTO`, `BAJAR`, `SIGUIENTE` (en los dos proyectos: el reparto es el mismo).
2. **La pausa congela.** Tras `PAUSA`, el overlay `EN PAUSA` es visible y la puntuación del HUD es la misma un segundo después.
3. **El hard drop puntúa.** Con `Espacio`, la puntuación del HUD pasa a ser mayor que cero (el hard drop suma `+2` por celda recorrida, así que el valor exacto depende de la pieza pero el signo no) y la página no se ha desplazado verticalmente.

Ningún test toca `/jugar/tetrix` con el reloj congelado: el motor necesita `requestAnimationFrame` vivo.

**Dos tests más para el modal**, en `/jugar/serpentina` — el modal es común a los siete juegos y allí el reloj sí se puede congelar:

4. **Invitado.** El modal no tiene `<input>`, pinta `INVITADO`, no ofrece `GUARDAR PUNTUACIÓN` y muestra el aviso; `INICIAR SESIÓN PARA GUARDAR` lleva a `/auth?next=…%3Fpuntuacion%3D…%26nivel%3D…`.
5. **Vuelta con sesión.** Entrando con cuenta a `/jugar/serpentina?puntuacion=42000&nivel=3`, el modal se abre con `42.000` y el `▸ PUNTUACIÓN GUARDADA_`, y `localStorage` sigue vacío.

El test existente de `FIN` comprueba además que con cuenta el modal no tiene `<input>` y que el nombre es el de la sesión.

### 3.8 Documentación

- `README.md:9-10` — «los ocho juegos son decorativos / no hay motor de juego» pasa a decir que son **siete**, que `TETRIX` tiene motor real y que los otros seis siguen decorativos. Sigue siendo verdad que no se persiste ninguna puntuación, y eso se dice explícitamente.
- `README.md:223` y `:271` — «los ocho juegos» → «los siete juegos».
- Sección «Project» de `CLAUDE.md` — misma corrección, más una línea sobre dónde vive el motor (`lib/tetris.ts` puro, `components/tetris-game.tsx` con el canvas) y sobre la regla del reparto: HUD común a los siete juegos, nada de pausa dentro de la pantalla.
- Fila de la SPEC 13 en el índice de specs del `README.md`.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y la suite en un estado conocido.

1. **Catálogo.** `lib/games.ts` según §3.1: fuera `bloque-buster`, `caida` → `tetrix`. Comprobación: `npm run dev`, `/biblioteca` pinta siete tarjetas, el chip `PUZZLE` deja sólo `TETRIX`, `/juego/tetrix` responde 200, `/juego/caida` y `/juego/bloque-buster` dan 404, y `/salon` abre en la pestaña `TETRIX`. La suite está roja en este punto (recuentos y rutas): se arregla en el paso 6.
2. **Motor.** `lib/tetris.ts` completo (§3.2), sin ningún consumidor todavía. Comprobación: `npx tsc --noEmit` limpio; en un `node --experimental-strip-types` o en la consola del navegador, `createState()` devuelve un tablero 20 × 10 de ceros, `rotateCW` cuatro veces sobre la T devuelve la forma original, una fila artificialmente llena se limpia sumando `100 × nivel`, un tablero lleno hasta arriba pone `lives = 0` y `over = true`, y `dropIntervalMs` devuelve 190 ms tanto para `level = 10` como para cualquier número de líneas por encima de 90 (el nivel no pasa de 10).
3. **Tokens y CSS.** Los siete `--piece-*` (§3.5) y las clases `.tetris-*` más el modificador `.crt-screen.tetris` (§3.4). Comprobación: los otros seis juegos siguen exactamente igual en `/jugar/serpentina` a 1440px y a 390px — la clase nueva no se les aplica.
4. **Componente.** `components/tetris-game.tsx` (§3.3): canvas, bucle, teclado, cruceta. Comprobación a mano en el navegador, que es la que manda: las piezas caen y aceleran al subir de nivel, rotan pegadas a las dos paredes (wall kicks), el ghost marca el aterrizaje, el `NEXT` coincide con la pieza que entra, el hard drop fija al instante, una línea completa desaparece y los cinco botones responden con el dedo y con el ratón, también manteniendo pulsado.
5. **Reproductor.** La bifurcación de `components/game-player.tsx` (§3.6). Comprobación: en `/jugar/tetrix` el HUD sube con el juego, `PAUSA` congela y `REANUDAR` sigue sin saltos de caída, `P` hace lo mismo que el botón, `FIN` abre el modal y el juego se detiene detrás, `JUGAR DE NUEVO` devuelve tablero vacío con 0 puntos, `Nivel 01` y un corazón, y un _top-out_ abre el modal con la puntuación final y el corazón ya gastado. En `/jugar/serpentina` no ha cambiado nada.
6. **Tests.** Los arreglos de §3.7 y los tres tests nuevos. Comprobación: `npm test` sólo falla en las seis capturas de referencia, por diferencia de imagen y en ningún otro sitio.
7. **Capturas.** Verificado a mano `/`, `/biblioteca` y `/salon` en los dos anchos, `npx playwright test --update-snapshots`. Revisar el diff: exactamente `home-*`, `biblioteca-*` y `salon-*` de los dos proyectos. Si aparece `reproductor-*` o `detalle-*`, algo se ha filtrado y se para aquí.
8. **Documentación y cierre.** `README.md` y `CLAUDE.md` según §3.8, más la fila de la SPEC 13 en el índice. Verificación final: `npm test` verde, `npx tsc --noEmit` y `npm run lint` limpios.

---

## 5. Criterios de aceptación

- [ ] `lib/games.ts` exporta siete juegos; no existe ningún `id` `bloque-buster` ni `caida` en el repo (código, tests y CSS).
- [ ] `/juego/tetrix` y `/jugar/tetrix` responden 200; `/juego/caida` y `/jugar/bloque-buster` responden 404.
- [ ] El chip `PUZZLE` de `/biblioteca` deja una sola tarjeta y su título es `TETRIX`.
- [ ] `/salon` abre en la pestaña `TETRIX` y muestra siete chips.
- [ ] En `/jugar/tetrix` las piezas caen solas, se mueven con `←`/`→`, rotan con `↑` y con `X`, bajan con `↓` y se fijan al instante con `Espacio`; `Espacio` no desplaza la página.
- [ ] Una rotación contra la pared izquierda y otra contra la derecha se completan (wall kicks) en vez de descartarse.
- [ ] Completar una línea la elimina, sube el contador interno de líneas y suma `100 × nivel` a la puntuación del HUD.
- [ ] A las 10 líneas el HUD marca `Nivel 02` y la caída es visiblemente más rápida.
- [ ] El nivel no pasa de `10`: a partir de las 90 líneas el HUD sigue marcando `Nivel 10`, la velocidad de caída se queda fija y las líneas siguen contando para la puntuación.
- [ ] La pieza fantasma se pinta en la posición de aterrizaje y el canvas `NEXT` muestra la pieza que entra a continuación.
- [ ] El HUD de `/jugar/tetrix` muestra **un solo** corazón al arrancar la partida.
- [ ] Un _top-out_ termina la partida: el corazón desaparece del HUD y se abre el modal `FIN DEL JUEGO` con la puntuación final, el juego queda detenido detrás y no hay ningún `requestAnimationFrame` vivo.
- [ ] `GUARDAR PUNTUACIÓN` sigue siendo decorativo: ninguna petición de red sale al pulsarlo y el `README` sigue diciendo que no se persiste nada.
- [ ] `JUGAR DE NUEVO` deja tablero vacío, `0` puntos, `Nivel 01` y un corazón.
- [ ] En `/jugar/serpentina` el HUD sigue mostrando tres corazones: el cambio a una vida es sólo de `TETRIX`.
- [ ] `PAUSA` (botón del HUD) y `P` (teclado) alternan el mismo estado; con la pausa activa el overlay `EN PAUSA` se ve, la puntuación no cambia y al reanudar la pieza no da un salto de caída acumulado.
- [ ] Dentro de la pantalla CRT no hay ningún botón de pausa: sólo tablero, `NEXT` y cruceta.
- [ ] El HUD superior es el mismo en `/jugar/tetrix` y en `/jugar/serpentina`: mismos cuatro bloques, mismos tres botones, sin bloque de `LÍNEAS`.
- [ ] A 390px de ancho, en `/jugar/tetrix` cada celda del tablero mide más de 18px, los cinco botones de la cruceta se pulsan con el dedo y la página no desborda horizontalmente.
- [ ] En `/jugar/serpentina` la pantalla conserva su `aspect-ratio: 4 / 3` y su escena animada a 1440px y a 390px.
- [ ] Los siete colores de pieza son distinguibles entre sí sobre el fondo del tubo, con el par cian/azul verificado en el navegador.
- [ ] `lib/tetris.ts` no referencia `document`, `window` ni `canvas`.
- [ ] La portada de `TETRIX` es una captura real del juego (`public/juegos/tetrix.png`) en la tarjeta de `/biblioteca`, en el carril de la portada y en la ficha de `/juego/tetrix`; los otros seis juegos conservan su portada dibujada en CSS.
- [ ] Dentro de la pantalla, `SIGUIENTE` queda alineado con el borde inferior del tablero y los mandos por encima, con los títulos `MOVIMIENTO`, `BAJAR` y `SIGUIENTE` en la misma tipografía, tamaño y color.
- [ ] Las siete piezas se pintan centradas en el recuadro de `SIGUIENTE`, con un desvío máximo de un cuarto de celda.
- [ ] El modal de fin de partida no tiene ningún `<input>`: el nombre es el de la sesión y no se puede editar.
- [ ] Con sesión de invitado el modal muestra el aviso de iniciar sesión y `INICIAR SESIÓN PARA GUARDAR` en lugar de `GUARDAR PUNTUACIÓN`, y ese botón lleva a `/auth` con la puntuación y el nivel en el `next`.
- [ ] Al volver de `/auth` con una cuenta de verdad, el modal reaparece con esa misma puntuación y marcada como guardada; `JUGAR DE NUEVO` la limpia de la URL y arranca una partida nueva.
- [ ] Ni ese flujo ni `GUARDAR PUNTUACIÓN` disparan ninguna petición: sigue sin persistirse nada.
- [ ] De las 14 capturas de referencia se regeneran exactamente seis: `home-*`, `biblioteca-*` y `salon-*` en los dos proyectos. `reproductor-*`, `detalle-*`, `auth-*` y `acerca-*` quedan intactas en el diff.
- [ ] `npm test` verde; `npx tsc --noEmit` y `npm run lint` limpios.
- [ ] `package.json` no tiene dependencias nuevas; no hay variables de entorno nuevas; no hay migraciones ni Edge Functions, así que no hay nada que empujar a Supabase antes de fusionar.
- [ ] `lib/scores.ts`, `components/leaderboard.tsx`, `components/hall-of-fame.tsx`, `components/library-browser.tsx`, `proxy.ts` y todo `lib/supabase/` quedan sin tocar.

---

## 6. Decisiones

- **Sí:** convertir `caida` en `tetrix` y borrar `bloque-buster`. `caida` ya era un Tetris con otro nombre; mantener las dos fichas habría dejado dos entradas PUZZLE describiendo el mismo juego, una jugable y otra no.
- **No:** conservar el id `caida` cambiando sólo el título. Habría salvado las semillas de `lib/scores.ts` y seis capturas, pero deja una URL que miente sobre su contenido en un proyecto donde las rutas son parte del diseño.
- **No:** `best` y `plays` a cero por ser un juego nuevo. Son datos falsos del catálogo, igual que en los otros seis; reiniciarlos no los hace más ciertos y sí cambia más capturas.
- **Sí:** motor sólo para `tetrix`, bifurcando por `game.id`. Los otros seis juegos no tienen motor y sus fichas describen cosas distintas: montarles un Tetris debajo sería una mentira peor que la escena decorativa.
- **No:** un registro de motores (`ENGINES[game.id]`) desde ya. Con un solo juego jugable es abstracción sin segundo caso; el `game.id === "tetrix"` es una línea y se convierte en registro cuando exista el segundo motor.
- **Sí:** una sola vida en `TETRIX`, un corazón en el HUD, y el _top-out_ abre el modal. Es el Tetris clásico: el montón llega al techo y la partida se acabó. El HUD no miente — pinta lo que hay — y el reinicio pasa por `JUGAR DE NUEVO`, que ya existía.
- **No:** tres vidas con limpieza de tablero al perder una. Era la decisión anterior de esta spec y quedaba con menos apoyo: el Tetris no tiene vidas que copiar, y «limpiar el tablero y seguir con los mismos puntos» es una regla inventada que hay que explicar al jugador.
- **No:** corazones decorativos fijos en 3. Es lo que hay hoy y es precisamente el HUD mintiendo.
- **No:** ocultar el bloque de Vidas en `TETRIX`. Con una vida el bloque sigue teniendo sentido — marca que no hay red — y el HUD tiene que ser común a los siete juegos.
- **Sí:** nivel `min(10, floor(lineas/10) + 1)` y velocidad `max(100, 1000 − (nivel−1) × 90)`. La progresión es la de la referencia y acopla nivel y líneas, que es lo que hace que el Tetris escale; la regla de «un nivel cada 2500 puntos» del reproductor falso no tiene nada que escalar.
- **Sí:** techo en el nivel 10. Con el nivel 10 la caída ya está en 190 ms, que es el límite de lo jugable con controles táctiles; seguir acelerando sólo añade niveles que nadie ve. Además da a la partida una meta legible: llegar al 10.
- **No:** terminar la partida al alcanzar el nivel 10. Sería un estado de victoria nuevo — otro título de modal o una pantalla propia — y esta spec ya introduce el primer motor del proyecto. Si el techo resulta aburrido, la pantalla de victoria es su propia spec.
- **No:** dejar el nivel subiendo sin techo como la referencia. A partir del nivel 11 el `max(100, …)` va acercando el intervalo a 100 ms y el juego pasa de difícil a imposible sin avisar.
- **Sí:** canvas 2D con la escala del `devicePixelRatio`. Es lo que hace la referencia y es un repintado por fotograma. La alternativa, 200 `div` reconciliados por React a 60 fps, son 12 000 reconciliaciones por segundo para pintar cuadrados.
- **Sí:** estado del motor en un `useRef` y mutación in situ; `onRun` sólo cuando `score`, `lives` o `level` cambian. Un `setState` por fotograma es el error clásico de portar un bucle de juego a React.
- **Sí:** tablero a la izquierda y `NEXT` más cruceta en una columna a la derecha, dentro de la pantalla. Es el reparto pedido y el que deja el tablero ocupando toda la altura del tubo.
- **No:** cruceta debajo del CRT, fuera de la pantalla. Se juega mejor con el pulgar, pero mezcla mandos del juego con el marco del mueble y añade una fila que empuja `.crt-bottom` fuera de la primera pantalla en móvil.
- **No:** botón de pausa dentro de la pantalla. Decisión explícita: la pausa vive en el HUD, que es común a todos los juegos, y dentro de la pantalla sólo aparece el overlay `EN PAUSA`.
- **Sí:** `aspect-ratio: 3 / 4` para la pantalla sólo en móvil y sólo cuando hospeda el tablero. Con `4 / 3` la celda queda en 11.6px (§3.4): se ve, no se juega. El modificador aísla el cambio y no roza la captura del reproductor decorativo.
- **Sí:** siete tokens `--piece-*` en `:root`, cuatro de ellos iguales a los neones existentes. Una sola paleta y siete piezas distinguibles. Reciclar los cuatro neones habría dejado tres pares de piezas idénticas en el tablero, que en un Tetris es información perdida, no un detalle estético.
- **Sí:** leer los colores del CSS con `getComputedStyle` y tener un respaldo literal. El CSS manda — `app/globals.css` es la fuente de verdad del tema — y el respaldo evita un tablero invisible si alguien renombra un token.
- **No:** duplicar la paleta como constante en `lib/tetris.ts`. Dos fuentes de verdad para el mismo color se desincronizan el día que se retoca el tema.
- **No:** octava pieza «tuerca». No es Tetris, y una pieza 3 × 3 con hueco central cambia la dificultad del juego que la ficha promete.
- **No:** bloque de `LÍNEAS` en el HUD. El HUD es común a los siete juegos y las líneas sólo existen en este; el nivel del HUD ya refleja el progreso.
- **No:** toggle claro/oscuro de la referencia. La app es oscura por diseño (`CLAUDE.md`) y el toggle guardaba estado en `localStorage`, que en este proyecto está deliberadamente vacío.
- **No:** panel lateral de la referencia con `SCORE`/`LINES`/`LEVEL` y la lista de controles. Duplicaría el HUD superior. Los controles se descubren por los botones visibles y se documentan en el `README`.
- **No:** overlay propio de `PAUSA`/`GAME OVER` con botón `Reiniciar`. El overlay `EN PAUSA` y el modal `FIN DEL JUEGO` del proyecto ya cubren los dos estados, con el estilo de la casa.
- **No:** bolsa de 7 (_7-bag_), _hold piece_, _lock delay_ y SRS completo. Son mejoras del Tetris moderno que la referencia no tiene; entran en otra spec si el juego se queda corto.
- **Sí:** portada en imagen para `TETRIX`, campo `image?` opcional en `Game`. El juego ya existe, así que su portada puede ser lo que es en vez de un dibujo aproximado en CSS; el campo opcional deja a los otros seis exactamente como estaban.
- **No:** sustituir el sistema de portadas en CSS por imágenes para todos. Los otros seis juegos no existen: una «captura» suya sería una ilustración inventada, que es justo lo que las clases `cover-*` ya hacen sin pesar 500 KB.
- **Sí:** `SIGUIENTE` abajo y los mandos arriba, con título en cada bloque. Alinear el recuadro con el borde inferior del tablero da una línea de apoyo común a los dos elementos y los títulos hacen legible para qué sirve cada grupo sin manual.
- **Sí:** centrar la pieza del `NEXT` por su caja de celdas llenas y con decimales. Centrar por la matriz es lo que hacía la referencia y es lo que dejaba casi todas las piezas arriba a la izquierda.
- **Sí:** nombre del modal no editable. Era un `<input>` que prometía elegir iniciales y no llevaba a ninguna parte: el jugador ya tiene nombre, el de su sesión.
- **Sí:** al invitado se le pide entrar antes de guardar, con los tres caminos nombrados (Google, GitHub, correo). Es la verdad del sistema: una sesión anónima se purga a los 30 días (SPEC 08), así que guardar ahí no significaría nada.
- **Sí:** la puntuación pendiente viaja en la URL (`?puntuacion=&nivel=`). La resuelve el servidor, sobrevive al rodeo de OAuth y evita el efecto que la rescataría tras hidratar. `sessionStorage` habría exigido ese efecto y un `setState` dentro, que el lint del repo prohíbe con razón.
- **No:** guardar la puntuación de verdad al volver del login. Exige tabla, RLS, migración y desplegar el esquema antes de fusionar (`CLAUDE.md`, «Database first, code second»). Es una spec propia; aquí el flujo queda listo para engancharla.
- **No:** enseñar el username técnico del invitado (`INV70A7E1D`) en el modal. `CLAUDE.md` lo prohíbe explícitamente y `displayName()` existe para eso: el invitado se ve como `INVITADO`.
- **Sí:** tests de TETRIX sin captura de pantalla. La secuencia de piezas sale de `Math.random()`: cualquier captura del tablero sería una imagen distinta cada ejecución.
- **No:** sembrar el azar con un LCG para poder capturar el tablero. Se podría, pero mete un parámetro de test en el motor y una captura frágil a cambio de cobertura que los tres tests de comportamiento ya dan.
- **No:** persistir la puntuación. Fuera de alcance por decisión explícita. El motor ya calcula un número real, así que guardarlo es una spec propia con tabla, RLS y política de invitados — no un añadido a esta.
- **Sí:** `serpentina` en los dos tests de auth que citaban `bloque-buster`. Prueban el proxy, no el juego, y así no arrancan un bucle de 60 fps de fondo.

---

## 7. Riesgos

| Riesgo                                                                                                                  | Mitigación                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El bucle `requestAnimationFrame` sobrevive al desmontar o al abrir el modal y consume CPU de fondo                      | `cancelAnimationFrame` en el `cleanup` del efecto y en las transiciones a `paused` y `over`. Criterio de aceptación explícito sobre que no queda ningún rAF vivo tras el modal.                                                                   |
| Doble verdad sobre la pausa entre el HUD y la tecla `P`                                                                 | `P` no guarda estado local: llama al mismo manejador que el botón del HUD. El reproductor sigue siendo el único dueño de `paused`.                                                                                                                |
| El `setInterval` decorativo sigue subiendo la puntuación por debajo del motor                                           | El efecto del temporizador se salta cuando `playable` es true. Se verifica mirando que la puntuación sólo cambie al limpiar líneas o al hacer drop.                                                                                               |
| Las capturas regeneradas consagran una regresión visual                                                                 | El paso 7 exige verificar `/`, `/biblioteca` y `/salon` a mano en los dos anchos antes de regenerar, y el diff está acotado a seis ficheros. Es la regla de `CLAUDE.md`.                                                                          |
| El tablero queda injugable en un móvil más estrecho que el iPhone 13 (360px, 320px)                                     | A 320px la pantalla útil baja a ~240px y con `3 / 4` la celda queda en ~16px: se juega peor pero se juega. Por debajo de eso queda fuera del catálogo que emula la suite y sería un ajuste posterior con una medición delante.                    |
| `--piece-l` (azul) se confunde con `--piece-i` (cian) en el tubo, con las scanlines encima                              | Verificación a ojo en el navegador antes de regenerar capturas, con criterio de aceptación propio. Si no convence, se oscurece `--piece-l` hacia `#0077ff` sin tocar nada más: el color vive en un único token.                                   |
| `image-rendering: pixelated` más `devicePixelRatio` dan un tablero borroso en pantallas Retina                          | El canvas se dimensiona con el `dpr` en los atributos y se escala por CSS, que es justo lo que evita el borrón. Se comprueba a 1440px en la pantalla del portátil.                                                                                |
| Los tres tests nuevos dependen del tiempo real y se vuelven intermitentes en CI                                         | Ninguno afirma un valor exacto: comprueban presencia, igualdad de la puntuación durante la pausa y `> 0` después de un hard drop. Nada que dependa de qué pieza salga ni de cuántos fotogramas pasen.                                             |
| Con una sola vida la partida se acaba en segundos y el juego frustra                                                    | Es el Tetris clásico y el reinicio es un clic: `JUGAR DE NUEVO` remonta el motor sin recargar la página. Si hace falta suavizarlo, el sitio es `LIVES` en `lib/tetris.ts` — una constante, un solo cambio, y el HUD pinta los corazones que diga. |
| El techo de nivel 10 deja la partida larga sin progresión visible                                                       | Aceptado y escrito en §3.2: por encima de las 90 líneas siguen subiendo la puntuación y el contador interno de líneas, y el multiplicador se queda en `× 10`. El nivel 10 es la meta, no un final.                                                |
| El nivel se calcula en dos sitios y el techo se olvida en uno                                                           | El nivel sale de una sola función de `lib/tetris.ts` con el `min(MAX_LEVEL, …)` dentro; el componente y el HUD sólo lo leen. El criterio de aceptación de las 90 líneas lo verifica.                                                              |
| `prefers-reduced-motion` no detiene el juego                                                                            | Deliberado: el movimiento **es** el contenido de la pantalla, no decoración. La lista de `@media (prefers-reduced-motion: reduce)` (`app/globals.css:2921`) sigue cubriendo la escena decorativa de los otros seis juegos y no se amplía.         |
| Un teclado con `keydown` en `window` roba las flechas a la navegación de la página                                      | El reproductor es pantalla completa sin scroll propio relevante y el manejador se desmonta con el componente. `Espacio` lleva `preventDefault()`, que es el único que desplazaría la página.                                                      |
| Alguien vuelve a añadir un octavo juego y rompe el `GAMES.slice(0, 6)` de la portada o la pestaña por defecto del salón | §1.4 deja escrito que las dos cosas derivan del array. No se añade abstracción para evitarlo: es una tabla de datos de seis entradas.                                                                                                             |
