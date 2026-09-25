# SPEC 15 — ARKANOID: segundo motor real dentro del CRT

> **Estado:** Borrador
> **Depende de:** SPEC 01, SPEC 04, SPEC 13
> **Fecha:** 2026-09-25
> **Objetivo:** Añadir `ARKANOID` como octavo juego del catálogo con el rompeladrillos de `references/started-games/04-arkanoid/` portado a React —niveles infinitos, bola cada vez más rápida y todo dibujado con la paleta de la web—, encajado en la pantalla CRT y en el HUD común que ya estableció la SPEC 13, sin persistir ninguna puntuación.

---

## 1. Punto de partida

### 1.1 Lo que la SPEC 13 ya dejó resuelto

Esta spec es la segunda de su familia, así que casi toda la carpintería existe. Lo que **no** se toca:

| Pieza existente                                                                          | Dónde                                                    | Papel aquí                                                       |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| HUD superior: Jugador · Puntuación · Vidas ♥ · Nivel                                   | `.player-hud` / `.hud-stat` (`app/globals.css:1191-1231`) | Se reutiliza **tal cual**. El motor le entrega los números.      |
| Botones `PAUSA` / `FIN` / `SALIR`                                                        | `.hud-actions`                                            | Únicos mandos de pausa. Dentro de la pantalla no hay ninguno.    |
| Overlay `EN PAUSA`                                                                       | `components/game-player.tsx`                              | Se reutiliza tal cual.                                            |
| Modal `FIN DEL JUEGO`, nombre no editable, bifurcación invitado / cuenta, vuelta de `/auth` | `.modal-bd` / `.modal`, `app/jugar/[id]/page.tsx`         | Se reutiliza entero y sin un solo cambio. Sigue sin persistir nada. |
| Contrato del motor con el reproductor (`paused`, `onTogglePause`, `onRun`, `onOver`)     | `components/tetris-game.tsx:68-77`                        | `ArkanoidGame` expone **exactamente** el mismo.                  |
| Remontaje al reiniciar con `runKey`                                                      | `components/game-player.tsx:58,100`                       | Se reutiliza tal cual.                                            |
| Campo `image?` en `Game` y `.cover-shot`                                                 | `lib/games.ts:19`, `app/globals.css:884`                  | Se reutiliza para la portada de `ARKANOID`.                      |
| Marco CRT, scanlines, `.crt-bottom`                                                      | `.crt` / `.crt-screen`                                    | El tablero vive **dentro** de `.crt-screen`.                     |

Lo único que cambia de estructura en el reproductor es que `PLAYABLE_ID` deja de ser un id y pasa a ser una tabla de dos entradas (§3.7).

### 1.2 Lo que trae la referencia

`references/started-games/04-arkanoid/` es un Arkanoid completo en JavaScript plano sobre un `<canvas>` de 800 × 600:

- **Geometría** (`game.js:4-16`): muro de 10 × 6 ladrillos de 64 × 24 px con origen en `(80, 80)` —`BLOCKS_ORIGIN_X` es `(800 − 10 × 64) / 2`—, pala de 81 × 14 en `y = 560`, bola de 16 × 16, `PADDLE_SPEED = 400` px/s.
- **Física**: colisión AABB (`collideAABB`), rebote en las tres paredes, rebote en la pala que se limita a invertir la componente vertical, y un ladrillo por fotograma como máximo (`break` tras el primer impacto).
- **Progresión** (`levels.js`): cinco muros hechos a mano —relleno completo, pirámide, damero, huecos irregulares, marco con cruz— con multiplicadores de velocidad `1.00`, `1.10`, `1.21`, `1.33`, `1.46`. Al limpiar el quinto, `gameState = 'win'`.
- **Vidas y puntuación**: tres vidas, `+10` por ladrillo, sin multiplicador.
- **Efectos** (`assets/spritesheet.js`): un spritesheet PNG con pala, bola y siete colores de ladrillo, más `EXPLOSION_FRAMES` de cuatro fotogramas por color y `EXPLOSION_DURATION = 150` ms. Dos sonidos `mp3`.

Seis cosas de la referencia **no encajan** con este proyecto y se descartan o se sustituyen (§6): el HUD dibujado dentro del canvas (`game.js:230-244`), el overlay de pausa con los botones de salto de nivel (`drawPauseOverlay`), el estado `win` —no existe con niveles infinitos—, los sonidos, el spritesheet PNG y el rebote de ángulo fijo.

### 1.3 Efectos colaterales medidos del octavo juego

No son opcionales: se listan aquí porque el plan tiene que cubrirlos.

| Qué cambia                                                 | Por qué                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `.card` y `.cover-bg` pasan de 7 a 8                       | `tests/screens.spec.ts:343` (nombre del test), `:345`, `:346` y `:380`.            |
| `.hall-tabs .chip` pasa de 7 a 8                           | `tests/screens.spec.ts:818`. `components/hall-of-fame.tsx:37` pinta un chip por juego. |
| Dos capturas de referencia                                 | `biblioteca-desktop` y `biblioteca-mobile`: entra una tarjeta nueva en la rejilla. |
| Otras dos capturas de referencia                           | `salon-desktop` y `salon-mobile`: entra un chip nuevo en la fila de pestañas.      |
| Prosa desmentida                                           | `README.md:9`, `:11`, `:224`, `:273` y la sección «Project» de `CLAUDE.md`, que dicen «los siete juegos» y «la excepción es TETRIX». |

Y lo que, medido, **no** cambia —importa tanto como lo que sí:

| Qué no cambia                            | Por qué                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| La portada `/` y sus dos capturas        | `app/page.tsx:15` pinta `GAMES.slice(0, 6)` y el juego nuevo va en la **octava** posición: el corte no lo alcanza. `components/home/*` no importa `GAMES` en ningún sitio, así que `.tick-row` y `.top-row` son datos propios de la portada. |
| La pestaña por defecto de `/salon`       | `components/hall-of-fame.tsx:18` usa `GAMES[0].id`, que sigue siendo `tetrix`.                            |
| Todas las tablas de puntuaciones         | `detailSeed`/`hallSeed` derivan de `gameId.length` (`lib/scores.ts`) y ningún id existente cambia. `arkanoid` estrena las suyas. |
| El chip `PUZZLE` y el buscador           | `ARKANOID` es `ARCADE`, y `"ser"` no lo encuentra: `tests/screens.spec.ts:350-369` siguen igual.            |
| `detalle-*`, `reproductor-*`, `auth-*`, `acerca-*`, `home-*` | Usan `serpentina` o no dependen del catálogo.                                                             |

---

## 2. Alcance

**Dentro:**

- `lib/games.ts`: octava ficha `arkanoid`, al final del array.
- Motor puro y sin DOM en `lib/arkanoid.ts`: física, muros, velocidad, vidas y puntuación.
- Componente `components/arkanoid-game.tsx`: `<canvas>`, bucle `requestAnimationFrame` con `dt`, teclado, arrastre de la pala y mandos superpuestos.
- `components/game-player.tsx`: `PLAYABLE_ID` pasa a ser una tabla de juegos con motor, de la que también sale el número inicial de vidas.
- Siete tokens `--brick-*` en `:root` y las clases `.ark-*` en `app/globals.css`.
- Niveles infinitos: los cinco muros de la referencia y, del sexto en adelante, muros generados de forma determinista a partir del número de nivel.
- Portada en imagen: captura real en `public/juegos/arkanoid.png`, con `.cover-bricks` como respaldo.
- Ajuste de `tests/screens.spec.ts` (cuatro recuentos y el nombre de un test) y cuatro tests nuevos sin captura.
- Regeneración de exactamente cuatro capturas de referencia: `biblioteca-*` y `salon-*` en los dos proyectos.
- `README.md` (prosa + índice de specs) y la sección «Project» de `CLAUDE.md`.

**Fuera:**

- **Persistir puntuaciones.** Igual que en la SPEC 13: `GUARDAR PUNTUACIÓN` sigue siendo decorativo, el invitado sigue siendo enviado a `/auth` y de vuelta por la URL, y no hay tabla, ni endpoint, ni escritura. La persistencia real es una spec propia.
- **Sonido.** Ni los dos `mp3` de la referencia ni ningún otro. El proyecto no tiene una sola línea de audio y meterlo abre silencio por defecto, control de volumen —que iría en el HUD común, prohibido por la SPEC 13— y la política de autoplay del navegador.
- **Power-ups, multibola, pala ampliable, ladrillos de varios golpes, vidas extra.** El Arkanoid de la referencia no los tiene. Son mecánicas nuevas, no un port.
- **Estado de victoria.** Con niveles infinitos no existe: la partida termina cuando se acaban las vidas.
- **Cambios en el HUD.** Ni un bloque nuevo, ni un botón nuevo: es común a los ocho juegos.
- **Los otros seis juegos decorativos.** Siguen con la escena CRT animada y el temporizador de puntuación.
- **`lib/scores.ts`, `components/leaderboard.tsx`, `components/hall-of-fame.tsx`, `components/library-browser.tsx`, `proxy.ts` y todo `lib/supabase/`.** Sin tocar.
- **Registro de motores genérico.** Sigue habiendo una tabla literal de dos entradas, no una abstracción (§6).

---

## 3. Diseño

### 3.1 Catálogo (`lib/games.ts`)

Se añade al **final** del array, después de `duelo-pixel`:

```ts
{
  id: "arkanoid",
  title: "ARKANOID",
  short: "Rompe el muro sin dejar caer la bola.",
  long: "Una bola de neón rebota entre las paredes de la pantalla y tú sólo controlas la pala. Rompe todos los ladrillos para pasar de nivel: el muro cambia en cada uno y la bola va cada vez más rápida, sin final. Golpea con el borde de la pala para desviarla y apuntar. Tres vidas; cuando cae la última bola, se acabó.",
  cat: "ARCADE",
  cover: "cover-bricks",
  image: "/juegos/arkanoid.png",
  color: "cyan",
  best: 128640,
  plays: "12.7K",
}
```

`cover-bricks` (`app/globals.css:890`) lleva huérfana desde que la SPEC 13 borró `bloque-buster`: vuelve a tener dueño y hace de respaldo del campo `image`. `best` y `plays` son datos falsos del catálogo, como los de los otros siete: no son marcas del motor y no pretenden serlo.

`Game`, `GameCat`, `GameColor`, `CATS` y `getGame()` no cambian. El octavo elemento no altera `GAMES[0]` ni el corte `slice(0, 6)` de la portada (§1.3).

### 3.2 El motor (`lib/arkanoid.ts`)

Módulo puro: sin `document`, sin `window`, sin React, sin canvas. La misma regla que hace razonable `lib/tetris.ts`.

```ts
/** Espacio lógico del juego, heredado de la referencia. */
export const WIDTH = 800;
export const HEIGHT = 600;

/** Tres vidas, como la referencia. */
export const LIVES = 3;

export const BRICK_COLS = 10;
export const BRICK_ROWS = 6;
export const BRICK_W = 64;
export const BRICK_H = 24;
export const ORIGIN_X = (WIDTH - BRICK_COLS * BRICK_W) / 2; // 80
export const ORIGIN_Y = 80;

/** Duración del destello de un ladrillo roto, en ms. */
export const BURST_MS = 150;

/** 1–7: índice de color de ladrillo. Nunca 0: un ladrillo muerto se marca con `alive`. */
export type BrickType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Brick = {
  x: number; y: number; w: number; h: number;
  type: BrickType;
  alive: boolean;
};

/** Destello de un ladrillo recién roto; se desvanece en BURST_MS. */
export type Burst = {
  x: number; y: number; w: number; h: number;
  type: BrickType;
  elapsed: number;
};

export type ArkanoidState = {
  paddle: { x: number; y: number; w: number; h: number };
  ball: { x: number; y: number; w: number; h: number; vx: number; vy: number };
  bricks: Brick[];
  bursts: Burst[];
  score: number;
  level: number;
  lives: number;
  /** La bola está pegada a la pala esperando a LANZAR. */
  serving: boolean;
  /** Saques de esta partida; decide hacia qué lado sale la bola. */
  serves: number;
  /** true cuando se pierde la última vida: el reproductor abre el modal. */
  over: boolean;
};

export function createState(): ArkanoidState;
/** Muro del nivel. Función pura: el mismo nivel devuelve siempre el mismo muro. */
export function layout(level: number): Brick[];
/** Módulo de la velocidad de la bola, en px/s. */
export function ballSpeed(level: number): number;
/** Velocidad de la pala, en px/s. Nunca por debajo de la bola. */
export function paddleSpeed(level: number): number;

/** Avanza `dt` segundos. Muta el estado in situ; el componente lo guarda en un ref. */
export function step(state: ArkanoidState, dt: number): void;
export function movePaddle(state: ArkanoidState, dir: -1 | 1, dt: number): void;
/** Centra la pala en `cx` (coordenadas lógicas): arrastre con dedo o ratón. */
export function setPaddleX(state: ArkanoidState, cx: number): void;
export function serve(state: ArkanoidState): void;
```

#### Velocidad de la bola

La referencia arranca en `|v| = √(200² + 300²) ≈ 360,55` px/s y sube ×1,10 por nivel, pero sólo tiene cinco niveles. Con niveles infinitos hace falta una curva de dos tramos y un techo:

```ts
const V0 = 224;        // ≈ 0,62 × la referencia
const SLOW_STEP = 1.04; // niveles 1–10
const FAST_STEP = 1.07; // niveles 11 en adelante
const V_MAX = 800;

export function ballSpeed(level: number): number {
  const n = Math.max(1, level);
  const slow = V0 * SLOW_STEP ** (Math.min(n, 10) - 1);
  const v = n <= 10 ? slow : slow * FAST_STEP ** (n - 10);
  return Math.min(V_MAX, v);
}
```

Las cuentas, que son el argumento:

| Nivel | Velocidad  | Contra la referencia |
| ------- | ------------ | ---------------------- |
| 1     | 224 px/s   | 0,62×                |
| 5     | 262 px/s   | 0,73×                |
| 10    | 319 px/s   | 0,88×                |
| 15    | 447 px/s   | 1,24×                |
| 24    | 800 px/s   | 2,22× — tope        |

Los diez primeros niveles se quedan **por debajo de la velocidad base de la referencia**, que es lo pedido: la bola tarda 2,7 s en cruzar la pantalla en el nivel 1 y 1,9 s en el 10. El tope se alcanza en el nivel 24 y a partir de ahí la dificultad la pone el muro, no la velocidad.

`paddleSpeed(level) = Math.max(480, ballSpeed(level) * 1.5)`. La pala nunca puede ser más lenta que la bola: con 400 px/s fijos de la referencia, a partir del nivel 15 la bola cruzaría por debajo antes de que la pala llegara, y el juego dejaría de depender de los reflejos para depender de la suerte.

#### Subpasos: la bola no atraviesa nada

A 800 px/s y 60 fps un fotograma son 13,3 px, menos que los 24 px de alto de un ladrillo —pero un fotograma perdido, una pestaña en segundo plano o un portátil sin batería lo convierten en 50 px y la bola aparece al otro lado del muro. `step()` parte el avance:

```ts
const MAX_STEP_PX = 8;
const dist = Math.hypot(state.ball.vx, state.ball.vy) * dt;
const steps = Math.max(1, Math.ceil(dist / MAX_STEP_PX));
for (let i = 0; i < steps; i++) advance(state, dt / steps);
```

Ocho píxeles es un tercio del alto del ladrillo y la mitad del lado de la bola: ningún obstáculo puede caber entre dos posiciones consecutivas. `dt` se limita además a 50 ms por fotograma, para que volver de una pestaña en segundo plano no dispare cien subpasos de golpe.

#### Rebote en la pala

La referencia hace `ball.vy = -Math.abs(ball.vy)` y nada más, así que el ángulo de la bola no cambia en toda la partida y el jugador no puede apuntar. Con muros generados eso acaba en el clásico último ladrillo de una esquina al que la bola no puede llegar nunca. Aquí el ángulo sale del punto de impacto:

```ts
const MAX_BOUNCE = (60 * Math.PI) / 180;
const offset = clamp((ballCx - paddleCx) / (paddle.w / 2), -1, 1);
const angle = offset * MAX_BOUNCE;
const v = ballSpeed(state.level);
ball.vx = v * Math.sin(angle);
ball.vy = -v * Math.cos(angle);
```

El módulo se reimpone en cada rebote contra la pala, así que la velocidad es siempre exactamente la del nivel y no deriva con los redondeos. El tope de 60° garantiza una componente vertical de al menos `cos 60° = 0,5 × v`: la bola nunca se queda rebotando en horizontal.

Contra paredes y ladrillos el rebote es el de la referencia: se invierte la componente correspondiente y se recoloca la bola justo fuera del obstáculo. En un ladrillo se compara el solapamiento horizontal con el vertical para decidir qué componente se invierte —la referencia siempre invertía la vertical, lo que hace que la bola atraviese de lado una fila entera—, y se rompe un ladrillo por subpaso como máximo.

#### Los muros

Niveles 1 a 5: los cinco de `references/started-games/04-arkanoid/levels.js`, tal cual, con sus colores traducidos a los tokens de §3.3 —relleno completo, pirámide, damero, huecos irregulares y marco con cruz.

Nivel 6 en adelante: generación determinista con el congruencial lineal del proyecto, sembrado con el número de nivel.

```
s = (level * 7919) % 233280
rand() = (s = (s * 9301 + 49297) % 233280) / 233280

filas = 4 + floor(rand() * 3)                  // 4, 5 o 6
por cada fila:
  tipo    = ((fila + level) % 7) + 1
  densidad = 0.55 + rand() * 0.35
  por cada columna 0..4:
    si rand() < densidad → emitir (col, fila) y su espejo (9 - col, fila)
si el muro tiene menos de 8 ladrillos → se rellena la fila 0 entera
```

Tres propiedades que importan: es **puro** (el nivel 47 es el mismo muro en cualquier máquina y en cualquier ejecución de la suite), es **simétrico** por construcción, lo que evita muros escorados donde la bola no tiene nada que hacer en media pantalla, y tiene **suelo de contenido** —el relleno de la fila 0 impide un nivel de dos ladrillos que se pasa en un segundo.

El congruencial `9301 / 49297 / 233280` es el mismo que `lib/scores.ts` usa en `seededScores`, copiado a propósito y con un comentario que lo dice: el motor no debe importar nada del módulo de datos falsos (§6).

#### Vidas, puntuación y fin de partida

- `lives` arranca en `LIVES = 3`. Cuando la bola sale por abajo, `lives--`. Con `lives > 0` la bola vuelve a la pala y `serving` pasa a `true`; el muro **no** se reinicia y la velocidad sigue siendo la del nivel. Con `lives === 0`, `over` pasa a `true` y el componente avisa al reproductor.
- Cada ladrillo roto suma `10 × nivel`. Limpiar el muro suma `100 × nivel` con el nivel que se acaba de limpiar, y después `level++`, `bricks = layout(level)` y `serving = true`. El nivel no tiene techo.
- `serve()` lanza la bola a 30° de la vertical, alternando el lado con `serves % 2`. Es determinista a propósito: sin `Math.random()` en el arranque, un test puede afirmar que tras `LANZAR` la puntuación acaba siendo mayor que cero sin depender de la suerte.
- Mientras `serving` es `true` la bola sigue a la pala, así que se puede colocar el saque.

`bursts` acumula el destello de cada ladrillo roto y `step()` les suma `dt`; los que pasan de `BURST_MS` se descartan. Es la traducción de las cuatro imágenes de explosión de la referencia a algo que no necesita un PNG (§6).

### 3.3 Tokens de color de ladrillo

La referencia usa siete colores (`red`, `yellow`, `cyan`, `magenta`, `hotpink`, `green`, `gray`) que no son los de la web. Se traducen a la paleta del proyecto, en `:root` de `app/globals.css`, justo debajo del bloque `--piece-*` de la SPEC 13:

```css
/* ladrillos de ARKANOID — la misma familia que las piezas de TETRIX */
--brick-cyan: #00f5ff; /* = --cyan */
--brick-magenta: #ff006e; /* = --magenta */
--brick-yellow: #f5ff00; /* = --yellow */
--brick-green: #00ff88; /* = --green */
--brick-amber: #ff5a1f; /* = --piece-z, en lugar del rojo */
--brick-violet: #8a5cff; /* = --piece-j, en lugar del hotpink */
--brick-silver: #c7d0e0; /* = --silver: el ladrillo neutro del muro 2 */
```

No se inventa ni un color: son los cuatro neones, dos de las mezclas que la SPEC 13 ya introdujo y el plata del podio. No entran en `@theme inline` —nada las consume como utilidad de Tailwind—, las lee el canvas con `getComputedStyle` y hay un array de hex literales de respaldo, exactamente como `PIECE_FALLBACK` en `components/tetris-game.tsx:38`.

### 3.4 El componente (`components/arkanoid-game.tsx`)

Cliente (`"use client"`). Contrato **idéntico** al de `TetrisGame`, para que el reproductor no tenga que distinguirlos más allá de cuál monta:

```ts
type ArkanoidGameProps = {
  paused: boolean;
  onTogglePause: () => void;
  onRun: (run: { score: number; lives: number; level: number }) => void;
  onOver: () => void;
};
```

Estructura interna:

1. **Bucle.** `requestAnimationFrame` con `dt` real (`(ts - last) / 1000`, limitado a 50 ms), `step()` y `draw()` en cada fotograma. Se cancela en el `cleanup` del efecto, cuando `paused` pasa a `true` y cuando `over` se pone a `true`. Al reanudar se reinicia `last`, para que la pausa no acumule un salto.
2. **Aviso al HUD.** `onRun` sólo cuando `score`, `lives` o `level` cambian respecto al último aviso, no cada fotograma. Es el mismo `publish()` de `tetris-game.tsx:223`.
3. **Canvas.** Tamaño lógico `WIDTH × HEIGHT` (800 × 600), multiplicado por `devicePixelRatio` en los atributos y escalado por CSS. Se pinta: fondo, ladrillos, destellos, pala y bola. Cada ladrillo lleva la banda superior `rgba(255,255,255,0.12)` que ya usa `drawBlock` en TETRIX, y la bola un resplandor con `shadowBlur` de su propio color.
4. **Teclado.** `keydown`/`keyup` en `window` con un conjunto de teclas pulsadas, porque la pala se mueve **mientras** se mantiene, no por pulsación: `←`/`→` mover, `Espacio` lanzar —con `preventDefault()`, o la página se desplaza—, `P` pausa, que llama al mismo `onTogglePause` del HUD y no guarda estado propio.
5. **Arrastre.** `onPointerDown` + `onPointerMove` sobre el canvas mueven la pala con `setPaddleX`, convirtiendo la coordenada del puntero a espacio lógico con `getBoundingClientRect()` —es lo que hace la referencia con `mousemove`, extendido a `pointer` para que funcione con el dedo. `touch-action: none` sobre el tablero, para que arrastrar no desplace la página en móvil. Un `pointerdown` con la bola en la pala también lanza.
6. **Mandos superpuestos.** Tres botones sobre el borde inferior de la pantalla: `←`, `LANZAR` y `→`, con sus `aria-label` en español. Izquierda y derecha se mantienen pulsados (`onPointerDown` marca la dirección, `onPointerUp` / `onPointerCancel` / `onPointerLeave` la sueltan) y el bucle los lee como si fueran teclas: nada de `setInterval` repetidor, porque aquí el movimiento es continuo y no discreto como el de TETRIX.
7. **Reinicio.** No hay lógica de reinicio dentro: `JUGAR DE NUEVO` cambia `runKey` en el reproductor y React remonta el componente.

Los colores se leen una vez al montar con `getComputedStyle(document.documentElement)`, con el array de respaldo si un token viniera vacío.

### 3.5 Reparto dentro de `.crt-screen`

El tablero es 800 × 600, o sea **4:3, exactamente el `aspect-ratio` de `.crt-screen`**. Eso hace que ocupe la pantalla entera sin bandas y —a diferencia de TETRIX, cuyo tablero 1:2 obligó al modificador `3 / 4` en móvil— **no hace falta ningún modificador de proporción**. La escena decorativa, TETRIX y ARKANOID conviven sin tocarse.

```
┌─ .crt-screen ──────────────────────────────┐
│ ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄ │  ← muro
│ ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄ │
│                                            │
│                   ·                        │  ← bola
│                                            │
│                ▀▀▀▀▀▀▀                     │  ← pala
│   [←]          [LANZAR]          [→]       │  ← mandos superpuestos
└────────────────────────────────────────────┘
```

Clases nuevas en `app/globals.css`, junto al bloque de TETRIX y con un comentario que diga que éste es el segundo escenario real:

- `.ark-stage` — `position: absolute; inset: 0;` centrado, con el mismo `radial-gradient` de fondo que `.tetris-stage` y `.game-arena`, para no romper la continuidad del tubo.
- `.ark-board` — `width: 100%; height: 100%; aspect-ratio: 4 / 3; display: block; touch-action: none;` y `image-rendering: pixelated`.
- `.ark-pad` — `position: absolute;` sobre el borde inferior, tres botones `.btn` repartidos con `justify-content: space-between` y `padding` lateral. `opacity: .55`, `:active` y `:focus-visible` a `1`; fondo semitransparente para que la pala se siga viendo por debajo cuando pasa; `touch-action: manipulation` y `user-select: none`.
- En `@media (max-width: 720px)` los tres botones pasan a `44px` de alto, que es el mínimo táctil.

El compromiso está en que los mandos caen sobre la franja donde vive la pala (`y = 560` de 600, el 93 % de la altura). Se acepta a cambio de no robarle altura al tablero: los botones van en los extremos y en el centro exacto, semitransparentes, y el control principal con el dedo es el arrastre —los botones son el respaldo. Está anotado en §7.

### 3.6 Lo que se dibuja

Nada de PNG. Todo con `fillRect`, leyendo los tokens:

| Elemento  | Cómo se pinta                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| Ladrillo  | Rectángulo del color de su tipo con 1 px de aire, más la banda superior `rgba(255,255,255,0.12)` de TETRIX. |
| Destello  | El mismo rectángulo, expandido hasta un 40 % y con `globalAlpha` de `1` a `0` según `elapsed / BURST_MS`.   |
| Pala      | Rectángulo en `var(--cyan)` con los extremos más claros, para que se lea el centro y los bordes —que es donde el ángulo del rebote cambia. |
| Bola      | Cuadrado en `var(--ink)` con `shadowBlur` y `shadowColor` del cian: en un tubo CRT un cuadrado con halo se lee mejor que un círculo pequeño. |
| Paredes   | Un borde interior de `var(--line)` en los tres lados que rebotan; el cuarto, el de abajo, se deja abierto.  |

### 3.7 Bifurcación en `components/game-player.tsx`

Hoy hay un `PLAYABLE_ID = "tetrix"` y un `NEW_TETRIX_RUN`. Con dos motores eso pasa a ser una tabla literal:

```ts
/** Los juegos con motor real y las vidas con las que arranca cada uno. */
const PLAYABLE: Record<string, number> = {
  tetrix: TETRIX_LIVES,
  arkanoid: ARKANOID_LIVES,
};
```

Y el resto:

```
Se mantiene: HUD entero, PAUSA / FIN / SALIR, overlay EN PAUSA,
             modal FIN DEL JUEGO con nombre no editable y bifurcación
             invitado / cuenta, la vuelta desde /auth por la URL,
             runKey, ignoreRun, restart(), .crt y .crt-bottom.

Cambia:      playable = game.id in PLAYABLE
             initialRun = { score: 0, lives: PLAYABLE[game.id] ?? LIVES, level: 1 }
             .crt-screen recibe "tetris" sólo cuando game.id === "tetrix"
             dentro de .crt-screen se monta TetrisGame, ArkanoidGame o .game-arena
```

El `setInterval` decorativo ya se salta cuando `playable` es `true` (`components/game-player.tsx:69`): con la tabla, se salta para los dos juegos sin tocar esa línea.

No se introduce un registro de motores con carga dinámica ni un mapa de componentes: son dos entradas y un ternario anidado en el JSX. La abstracción entra cuando haya un tercer motor y se vea qué tienen en común de verdad.

### 3.8 Tests

**Arreglos obligados** (§1.3), en `tests/screens.spec.ts`:

| Línea | Cambio                                              |
| ------- | ----------------------------------------------------- |
| 343   | Nombre del test: «muestra los 7 juegos» → «los 8»   |
| 345   | `.card` `toHaveCount(7)` → `toHaveCount(8)`         |
| 346   | `.cover-bg` `toHaveCount(7)` → `toHaveCount(8)`     |
| 380   | `.card` `toHaveCount(7)` → `toHaveCount(8)`         |
| 818   | `.hall-tabs .chip` `toHaveCount(7)` → `toHaveCount(8)` |

**Tests nuevos**, en un `describe("arkanoid")` propio, sin captura de pantalla y con el reloj **vivo** —el motor necesita `requestAnimationFrame`—, siguiendo el patrón del `describe("tetrix")` de `tests/screens.spec.ts:513`:

1. **Arranque.** En `/jugar/arkanoid`: `.ark-board` es visible, el HUD marca `Puntuación 0`, `♥ ♥ ♥` y `Nivel 01`; los tres botones (`Mover la pala a la izquierda`, `Lanzar la bola`, `Mover la pala a la derecha`) son visibles y dentro de la pantalla no hay ningún botón de pausa.
2. **La pausa congela.** Tras `PAUSA`, el overlay `EN PAUSA` es visible y la puntuación del HUD es la misma un segundo después.
3. **Romper ladrillos puntúa.** Con `Espacio` se lanza la bola; el muro del nivel 1 es el relleno completo y el saque es determinista, así que la puntuación del HUD acaba siendo mayor que cero. Además la página no se ha desplazado verticalmente.
4. **El HUD es el común.** `/jugar/arkanoid` y `/jugar/serpentina` tienen los mismos cuatro bloques de HUD y los mismos tres botones: ni uno más.

Ninguno afirma un valor exacto de puntuación ni depende de cuántos fotogramas pasen.

### 3.9 Documentación

- `README.md:9` — «Seis de los siete juegos son decorativos. La excepción es `TETRIX`» pasa a «Seis de los ocho… Las excepciones son `TETRIX` y `ARKANOID`», con una línea sobre qué es cada uno. Sigue siendo verdad que no se persiste ninguna puntuación, y se dice.
- `README.md:11`, `:224`, `:273` — «los siete juegos» → «los ocho juegos».
- `README.md:264` y alrededores — el árbol de ficheros gana `arkanoid-game.tsx` y `lib/arkanoid.ts`.
- Sección «Project» de `CLAUDE.md` — misma corrección, más la regla que esta spec confirma: el HUD es común a los ocho juegos, no hay pausa dentro de la pantalla y la puntuación sigue sin persistirse en ninguno de los dos motores.
- Fila de la SPEC 15 en el índice de specs del `README.md`.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y la suite en un estado conocido.

1. **Catálogo.** La ficha de §3.1. Comprobación: `npm run dev`, `/biblioteca` pinta ocho tarjetas, el chip `ARCADE` deja cuatro, `/juego/arkanoid` responde 200 con su tabla de diez filas, `/salon` sigue abriendo en `TETRIX` y tiene ocho chips, y la portada `/` sigue mostrando exactamente los mismos seis juegos. La suite está roja en los cuatro recuentos: se arregla en el paso 6.
2. **Motor.** `lib/arkanoid.ts` completo (§3.2), sin ningún consumidor todavía. Comprobación: `npx tsc --noEmit` limpio; en la consola del navegador, `layout(1)` devuelve 60 ladrillos, `layout(47)` devuelve dos veces lo mismo en dos llamadas, `ballSpeed(1)` es 224, `ballSpeed(10)` ≈ 319, `ballSpeed(24)` es 800 y `ballSpeed(999)` sigue siendo 800; `step()` con un `dt` enorme no deja la bola fuera del tablero.
3. **Tokens y CSS.** Los siete `--brick-*` (§3.3) y las clases `.ark-*` (§3.5). Comprobación: TETRIX y los seis decorativos se ven exactamente igual a 1440px y a 390px.
4. **Componente.** `components/arkanoid-game.tsx` (§3.4). Comprobación a mano en el navegador, que es la que manda: la bola rebota en las tres paredes y en la pala, el ángulo cambia según dónde golpee, romper un ladrillo lo hace desaparecer con destello, limpiar el muro sube de nivel con muro nuevo y bola más rápida, perder la bola resta una vida y devuelve el saque, la pala se mueve con el teclado, con los botones y arrastrando, y el nivel 6 es el mismo muro tras recargar.
5. **Reproductor.** La tabla `PLAYABLE` y el montaje (§3.7). Comprobación: en `/jugar/arkanoid` el HUD sube con el juego y arranca con tres corazones, `PAUSA` congela y `REANUDAR` no da saltos, `P` hace lo mismo que el botón, `FIN` abre el modal y el juego se detiene detrás, `JUGAR DE NUEVO` devuelve muro completo, 0 puntos, `Nivel 01` y tres corazones. En `/jugar/tetrix` y `/jugar/serpentina` no ha cambiado nada.
6. **Tests.** Los cinco arreglos y los cuatro tests nuevos de §3.8. Comprobación: `npm test` sólo falla en las cuatro capturas de referencia, por diferencia de imagen y en ningún otro sitio.
7. **Portada y capturas.** Captura real del juego a `public/juegos/arkanoid.png`; verificado a mano `/biblioteca` y `/salon` en los dos anchos, `npx playwright test --update-snapshots`. Revisar el diff: exactamente `biblioteca-*` y `salon-*` de los dos proyectos. Si aparece `home-*`, `detalle-*` o `reproductor-*`, algo se ha filtrado y se para aquí.
8. **Documentación y cierre.** `README.md` y `CLAUDE.md` según §3.9, más la fila de la SPEC 15 en el índice. Verificación final: `npm test` verde, `npx tsc --noEmit` y `npm run lint` limpios.

---

## 5. Criterios de aceptación

- [ ] `lib/games.ts` exporta ocho juegos y `arkanoid` es el último del array.
- [ ] `/juego/arkanoid` y `/jugar/arkanoid` responden 200; la ficha muestra diez puntuaciones y `/salon` ocho chips.
- [ ] `GAMES[0]` sigue siendo `tetrix`: `/salon` abre en su pestaña y las tablas de los siete juegos anteriores son idénticas.
- [ ] La portada `/` sigue mostrando los mismos seis juegos y sus dos capturas de referencia no cambian.
- [ ] El chip `ARCADE` de `/biblioteca` pasa a cuatro tarjetas; el chip `PUZZLE` sigue dejando sólo `TETRIX`.
- [ ] En `/jugar/arkanoid` la bola rebota en las paredes izquierda, derecha y superior, y sale por abajo.
- [ ] El HUD arranca con **tres** corazones; cada bola perdida quita uno y con el tercero se abre el modal `FIN DEL JUEGO` con la puntuación final.
- [ ] Al perder una vida el muro **no** se reinicia y la bola vuelve pegada a la pala esperando a `LANZAR`.
- [ ] Golpear con el borde izquierdo de la pala manda la bola a la izquierda y con el derecho a la derecha; con el centro sale recta.
- [ ] Romper un ladrillo suma `10 × nivel` y deja un destello que se apaga en ~150 ms.
- [ ] Limpiar el muro suma `100 × nivel`, sube el `Nivel` del HUD, pinta un muro distinto y la bola es más rápida.
- [ ] Los niveles 1 a 5 son los cinco muros de la referencia, en orden.
- [ ] El muro del nivel 6 (y del 20, y del 47) es el mismo tras recargar la página y tras reiniciar la partida: la generación es determinista.
- [ ] Ningún nivel generado tiene menos de 8 ladrillos, y todos son simétricos respecto al eje vertical.
- [ ] El nivel no tiene techo: se puede pasar del 24 y la velocidad se queda en 800 px/s.
- [ ] Con la velocidad al tope, la bola nunca atraviesa un ladrillo ni una pared, ni siquiera tras dejar la pestaña en segundo plano y volver.
- [ ] La pala se mueve con `←`/`→`, con los tres botones de la pantalla y arrastrando el puntero o el dedo sobre el tablero; arrastrar no desplaza la página.
- [ ] `Espacio` lanza la bola y no desplaza la página.
- [ ] `PAUSA` (botón del HUD) y `P` (teclado) alternan el mismo estado; con la pausa activa el overlay `EN PAUSA` se ve, la puntuación no cambia y al reanudar la bola no da un salto.
- [ ] Dentro de la pantalla CRT no hay ningún botón de pausa: sólo el tablero y los tres mandos.
- [ ] El HUD superior es el mismo en `/jugar/arkanoid`, `/jugar/tetrix` y `/jugar/serpentina`: mismos cuatro bloques y mismos tres botones.
- [ ] `FIN` detiene el juego detrás del modal y no queda ningún `requestAnimationFrame` vivo.
- [ ] `JUGAR DE NUEVO` deja muro completo del nivel 1, `0` puntos, `Nivel 01` y tres corazones.
- [ ] `GUARDAR PUNTUACIÓN` sigue siendo decorativo y el flujo del invitado sigue llevando la partida a `/auth` y de vuelta por la URL: ninguna petición de red sale en ninguno de los dos casos.
- [ ] `lib/arkanoid.ts` no referencia `document`, `window`, `canvas` ni `Math.random`.
- [ ] `lib/arkanoid.ts` no importa nada de `lib/scores.ts`.
- [ ] Los siete colores de ladrillo son distinguibles entre sí sobre el fondo del tubo, con las scanlines encima.
- [ ] `.crt-screen` conserva su `aspect-ratio: 4 / 3` en `/jugar/arkanoid` a 1440px y a 390px: no hay modificador de proporción nuevo.
- [ ] A 390px de ancho los tres botones miden al menos 44px de alto y la página no desborda horizontalmente.
- [ ] La portada de `ARKANOID` es una captura real del juego (`public/juegos/arkanoid.png`) en la tarjeta de `/biblioteca` y en la ficha de `/juego/arkanoid`.
- [ ] `TETRIX` y los seis juegos decorativos se comportan y se ven exactamente igual que antes de esta spec.
- [ ] De las 14 capturas de referencia se regeneran exactamente cuatro: `biblioteca-*` y `salon-*` en los dos proyectos.
- [ ] `npm test` verde; `npx tsc --noEmit` y `npm run lint` limpios.
- [ ] `package.json` no tiene dependencias nuevas; no hay variables de entorno nuevas; no hay migraciones ni Edge Functions, así que no hay nada que empujar a Supabase antes de fusionar.
- [ ] `lib/scores.ts`, `lib/tetris.ts`, `components/tetris-game.tsx`, `components/leaderboard.tsx`, `components/hall-of-fame.tsx`, `components/library-browser.tsx`, `proxy.ts` y todo `lib/supabase/` quedan sin tocar.

---

## 6. Decisiones

- **Sí:** añadir un octavo juego al final del array. Es la posición que no cambia nada más: la portada corta en `slice(0, 6)`, la pestaña por defecto del salón es `GAMES[0]` y las semillas del LCG dependen del id de cada juego. Cuatro capturas en vez de seis.
- **No:** reconvertir `duelo-pixel` en el rompeladrillos. Es lo más cercano que hay —paleta y pelota— pero su ficha describe un pong a dos jugadores en la categoría `VERSUS`: habría que reescribirla entera, dejaría `VERSUS` sin ningún juego y cambiaría sus tablas al cambiar el id. Añadir es más barato que mentir.
- **No:** resucitar el id `bloque-buster` que la SPEC 13 borró. Su ficha ya no existe y su nombre no decía qué era; `.cover-bricks`, que sí sobrevivió, se recicla como respaldo de portada.
- **Sí:** el nombre `ARKANOID` y el id `arkanoid`, pedido explícitamente. Rompe la convención en español del resto del catálogo (`SERPENTINA`, `GLOTÓN`, `RANARIA`) y es una marca de Taito, lo que se anota aquí porque es una decisión consciente, no un descuido.
- **Sí:** tres vidas, como la referencia. Es lo que hace que el bloque de Vidas del HUD signifique algo en un juego donde perder la bola es constante; con una sola vida (la regla de TETRIX) la partida dura veinte segundos y la curva de velocidad no llega a verse nunca.
- **Sí:** los cinco muros de la referencia para los cinco primeros niveles y generación determinista a partir del sexto. Los cinco muros hechos a mano son lo que da carácter al principio de la partida; la generación es lo que hace que «infinitos niveles» signifique algo más que un bucle de cinco.
- **No:** ciclar los cinco muros indefinidamente. Es lo más simple y no añade azar, pero a partir del sexto nivel el jugador ya lo ha visto todo y lo único que cambia es un número.
- **No:** generar también los cinco primeros. Menos código y ninguna tabla, pero se tiran los muros de la referencia, que es justamente lo que esta spec vino a portar.
- **Sí:** generación determinista sembrada con el número de nivel, simétrica y con suelo de ocho ladrillos. Determinista para que un test pueda afirmar algo sobre el nivel 6; simétrica para que no salgan muros escorados; con suelo para que no salga un nivel de dos ladrillos.
- **No:** importar el congruencial de `lib/scores.ts`. Ese módulo son datos falsos del catálogo y el motor no debe depender de él; la alternativa —exportar un `lcg()` desde ahí— acopla el juego real a la maqueta. Se copian tres constantes con un comentario que lo explica.
- **Sí:** curva de dos tramos con tope. Los diez primeros niveles se quedan por debajo de la velocidad base de la referencia, que es lo pedido, y el tope de 800 px/s existe porque más allá la partida deja de depender de los reflejos.
- **No:** dejar la velocidad subiendo sin techo. Con subpasos la física aguantaría, pero el juego se vuelve imposible en algún punto sin avisar y los niveles siguientes no los ve nadie.
- **No:** un solo tramo geométrico desde el nivel 1. Más fácil de explicar, pero cualquier ritmo que llegue a ser interesante en el nivel 20 incumple «los diez primeros bastante lenta».
- **Sí:** subpasos de 8 px como máximo y `dt` limitado a 50 ms. Es barato —dos o tres iteraciones por fotograma en el peor caso— y elimina de raíz la clase de bug más típica de un rompeladrillos: la bola que atraviesa el muro cuando el navegador se atasca.
- **Sí:** rebote con ángulo según el punto de impacto, limitado a ±60°. Convierte la pala en algo que se apunta. Con el rebote de ángulo fijo de la referencia, el último ladrillo de una esquina puede volverse inalcanzable —y con muros generados eso acabaría pasando.
- **Sí:** reimponer el módulo de la velocidad en cada rebote contra la pala. Sin eso, los redondeos hacen que la velocidad derive a lo largo de un nivel largo y la curva deje de significar nada.
- **Sí:** comparar solapamientos para decidir qué componente se invierte al romper un ladrillo. La referencia siempre invierte la vertical, lo que hace que una bola que entra de lado recorra una fila entera desde dentro.
- **Sí:** todo dibujado con `fillRect` leyendo tokens de `:root`. Cero assets binarios, nitidez a cualquier `devicePixelRatio`, una sola fuente de verdad para el color y el mismo código de dibujo que TETRIX. El CSS manda, con respaldo literal por si un token desaparece.
- **No:** generar un spritesheet PNG con la paleta de la web. Era la opción pedida y es viable, pero mete al repositorio un binario generado más el script que lo genera, y obliga a volver a correrlo cada vez que se retoque el tema —justo la segunda fuente de verdad que la SPEC 13 evitó a propósito.
- **No:** reusar `spritesheet-breakout.png` de la referencia. Cero trabajo de arte, pero sus colores (rojo, gris, hotpink) no son los de la web y su pixel-art de 32 × 16 se ve estirado sobre un tablero que escala con el CRT.
- **Sí:** siete tokens `--brick-*`, todos con valores que ya existen en la paleta. No se inventa ni un color nuevo: cuatro neones, dos mezclas de la SPEC 13 y el plata del podio.
- **Sí:** tablero a pantalla completa, con los mandos superpuestos abajo. El tablero es 4:3 y la pantalla también, así que llena el tubo sin bandas y sin necesitar el modificador de proporción que TETRIX sí necesitó en móvil.
- **No:** columna lateral con los mandos, como TETRIX. Sería coherente entre los dos motores, pero un tablero 4:3 dentro de una pantalla 4:3 menos una columna queda pequeño, y en móvil obligaría otra vez al `aspect-ratio: 3 / 4` —que en un juego más ancho que alto es peor todavía.
- **Sí:** arrastre del puntero sobre el tablero como control principal táctil. Es lo que hace la referencia con `mousemove` y es la única forma de jugar bien un rompeladrillos con el dedo; los tres botones son el respaldo y el camino accesible.
- **No:** botón de pausa dentro de la pantalla. Misma decisión que la SPEC 13: la pausa vive en el HUD, común a todos los juegos.
- **Sí:** destello dibujado al romper un ladrillo. Traduce las cuatro imágenes de explosión de la referencia sin necesitar el PNG, y el golpe se siente arcade en vez de seco.
- **No:** sonido. El proyecto no tiene ni una línea de audio; meterlo obliga a decidir silencio por defecto, control de volumen en un HUD que no admite bloques nuevos y la política de autoplay del navegador. Spec propia si alguna vez interesa.
- **Sí:** `10 × nivel` por ladrillo y `100 × nivel` por muro limpiado. El nivel multiplica, igual que en TETRIX, así que la puntuación mide lo lejos que se llegó y no cuántos ladrillos se rompieron; el bonus premia terminar el muro en vez de perder la última bola con dos ladrillos vivos.
- **No:** `+10` fijo, como la referencia. Con niveles infinitos deja la puntuación plana y hace que el nivel 40 valga lo mismo que el 2.
- **No:** estado de victoria. Con niveles infinitos no existe; la referencia lo tenía porque se quedaba sin muros en el quinto.
- **No:** power-ups, multibola, pala ampliable ni ladrillos de varios golpes. La referencia no los tiene: serían mecánicas nuevas, no un port.
- **Sí:** tabla literal `PLAYABLE` de dos entradas en el reproductor, de la que salen también las vidas iniciales. Es una línea más que el `game.id === "tetrix"` de antes y evita que el número de vidas de cada motor viva en dos sitios.
- **No:** un registro de motores con carga dinámica. Con dos juegos jugables sigue siendo abstracción sin caso suficiente; la SPEC 13 ya tomó esta decisión y aquí sólo se confirma.
- **Sí:** contrato de props idéntico al de `TetrisGame`. Que los dos motores hablen igual con el reproductor es lo que mantiene el HUD común y lo que hará barato el tercero.
- **Sí:** tests sin captura de pantalla para el juego. Un canvas con una bola en movimiento es una imagen distinta en cada ejecución.
- **Sí:** saque determinista, alternando lado. Sin `Math.random()` en el arranque, un test puede afirmar que tras `LANZAR` se rompe algo, sin depender de la suerte y sin meter un parámetro de test en el motor.
- **No:** persistir la puntuación. Fuera de alcance por la misma razón que en la SPEC 13: exige tabla, RLS, migración y desplegar el esquema antes de fusionar. El flujo del modal ya está listo para engancharla el día que exista.

---

## 7. Riesgos

| Riesgo                                                                                          | Mitigación                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La bola atraviesa un ladrillo o una pared a velocidad alta, o al volver de una pestaña en segundo plano | Subpasos de 8 px como máximo y `dt` limitado a 50 ms (§3.2). Criterio de aceptación propio que lo verifica con el tope de velocidad puesto.                                                                     |
| Un muro generado resulta imposible, trivial o deja un ladrillo inalcanzable                     | Simetría por construcción, densidad mínima del 55 %, suelo de ocho ladrillos y rebote con ángulo apuntable —que es lo que permite llegar a una esquina. Si aun así aparece un caso malo, la generación está en una sola función pura y se ajusta ahí. |
| Los mandos superpuestos tapan la pala, que vive en el 93 % de la altura                         | Botones en los extremos y en el centro exacto, semitransparentes (`opacity: .55`) y con fondo `rgba`, de modo que la pala se ve por debajo. El control principal con el dedo es el arrastre. Verificado a mano a 390px antes de regenerar capturas. |
| El arrastre sobre el tablero pelea con el desplazamiento de la página en móvil                  | `touch-action: none` en `.ark-board` y `preventDefault()` en `pointerdown`. El reproductor no tiene scroll propio relevante y el manejador se desmonta con el componente.                                      |
| El bucle `requestAnimationFrame` sobrevive al desmontar o al abrir el modal                     | `cancelAnimationFrame` en el `cleanup` del efecto y en las transiciones a `paused` y `over`, igual que en `components/tetris-game.tsx:300`. Criterio de aceptación explícito.                                   |
| Doble verdad sobre la pausa entre el HUD y la tecla `P`                                         | `P` no guarda estado local: llama al mismo `onTogglePause` del reproductor, que sigue siendo el único dueño de `paused`.                                                                                        |
| Las cuatro capturas regeneradas consagran una regresión visual                                  | El paso 7 exige verificar `/biblioteca` y `/salon` a mano en los dos anchos antes de regenerar, y el diff está acotado a cuatro ficheros. Es la regla de `CLAUDE.md`.                                            |
| A 390px el tablero queda en ~310 × 232 px y la pala en ~31 px                                   | Se juega, pero justo. Es la consecuencia de mantener el `4 / 3` del tubo y no se compensa aquí: cambiar la proporción de la pantalla en un juego más ancho que alto lo empeoraría. Si molesta, el ajuste es ampliar la pala en espacio lógico, una constante en `lib/arkanoid.ts`. |
| Dos motores comparten un contrato de props que ningún test obliga a respetar                    | El test 4 de §3.8 compara el HUD de los dos juegos jugables y el decorativo. No es una comprobación de tipos, pero sí detecta el día en que uno de los dos empiece a pintar su propio HUD.                       |
| Alguien añade un noveno juego y vuelve a romper los recuentos de la suite                       | §1.3 deja escrito qué deriva del array y qué no. No se añade abstracción para evitarlo: es una tabla de datos de ocho entradas.                                                                                |
| `prefers-reduced-motion` no detiene el juego                                                    | Deliberado, igual que en TETRIX: el movimiento **es** el contenido de la pantalla. La lista de `@media (prefers-reduced-motion: reduce)` sigue cubriendo la escena decorativa y no se amplía.                    |
