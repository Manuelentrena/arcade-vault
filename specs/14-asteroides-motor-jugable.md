# SPEC 14 — ASTEROIDES: segundo juego con motor real dentro del CRT

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 04, SPEC 13
> **Fecha:** 2026-09-25
> **Objetivo:** Convertir la entrada decorativa `ROCAS` en un `ASTEROIDES` jugable de verdad, con el motor de `references/started-games/02-asteroids/` portado a React y encajado dentro de la pantalla CRT, reutilizando sin tocarlos el HUD común y el modal de fin que ya sirven a `TETRIX`.

---

## 1. Punto de partida

### 1.1 Lo que hay hoy en el reproductor

SPEC 13 dejó un único juego con motor real. `components/game-player.tsx` lo decide en una línea:

```ts
/** El único juego con motor real: el resto sigue con la escena decorativa. */
const PLAYABLE_ID = "tetrix";
```

Alrededor de esa línea hay tres piezas que esta spec **reutiliza tal cual**:

- El HUD común (`.player-hud`): Jugador, Puntuación, Vidas, Nivel, y los botones `PAUSA` / `FIN` / `SALIR`. Nada específico de un juego entra ahí.
- El contrato del motor: props `{ paused, onTogglePause, onRun, onOver }`. El juego no pinta HUD, no tiene botón de pausa propio y no sabe quién juega: solo empuja números por `onRun` y avisa del final con `onOver`.
- El modal `FIN DEL JUEGO` con sus tres ramas: `saved` enseña el aviso `▸ PUNTUACIÓN GUARDADA_`, un invitado recibe la invitación a iniciar sesión, y una sesión real ve el botón decorativo `GUARDAR PUNTUACIÓN`. La ida y vuelta por `/auth` viaja en la URL (`?puntuacion=&nivel=`) y la valida `app/jugar/[id]/page.tsx`.

`ROCAS` es hoy una de las seis entradas decorativas: su pantalla anima una escena CRT y un `setInterval` de 220 ms le sube la puntuación sola.

### 1.2 Lo que trae la referencia

`references/started-games/02-asteroids/game.js` son 510 líneas en un único script global, sin módulos ni exportaciones, con `ctx` y el estado del juego como variables de fichero. Sus números:

| Concepto | Valor |
| --- | --- |
| Mundo | 800 × 600, envolvente toroidal |
| Nave | giro 3,5 rad/s, empuje 260 px/s², radio 12, morro a 21 px |
| Rozamiento | `v *= 0.987` **por fotograma** |
| Bala | 520 px/s, vive 1,1 s, radio 2, cadencia 0,2 s |
| Asteroides | radios `[0, 16, 30, 50]`, velocidades `[0, 85, 55, 32]`, puntos `[0, 100, 50, 20]` |
| División | un asteroide roto da exactamente 2 del tamaño inferior; el tamaño 1 no se divide |
| Oleada | `3 + nivel` asteroides, sin tope; se generan a más de 130 px del centro |
| Objeto | uno solo, `3x` (disparo triple, apertura 0,18 rad), 15 % por muerte, garantizado al quinto, dura 5 s, vive 12 s |
| Vidas | 3, con 2 s de pausa al morir y 3 s de invulnerabilidad al reaparecer |
| Colisión | círculo contra círculo; contra la nave con un factor 0,82 «de tacto» |

Lo que la referencia **no** tiene: pausa, mandos táctiles, fondo (dibuja negro plano), y nada de esto está separado del DOM — el HUD se pinta dentro del canvas y las teclas se leen de un mapa global.

### 1.3 Lo que cambia en el catálogo

`ROCAS` (`id: "rocas"`) desaparece y en su sitio queda `ASTEROIDES` (`id: "asteroides"`). Siguen siendo siete juegos y la categoría sigue siendo `SHOOTER`. Efectos colaterales medidos, todos aceptados:

- `/juego/rocas` y `/jugar/rocas` pasan a devolver 404. No hay despliegue previo con esa URL en circulación.
- Las semillas de `lib/scores.ts` dependen **solo de la longitud del id** (`detailSeed = id.length * 17 + 3`, `hallSeed = id.length * 23 + 7`). De 5 a 10 caracteres, así que la clasificación falsa del juego se reescribe entera y pasa a coincidir con la de `SERPENTINA`, que también tiene 10. El catálogo ya tenía ese solape entre `tetrix` y `gloton`, ambos de 6.
- El texto de la tarjeta cambia en la biblioteca, en el carrusel de la portada y en el selector del Salón de la Fama: hay que regenerar las capturas de `home`, `biblioteca` y `salon` en los dos proyectos de Playwright.

---

## 2. Alcance

**Dentro:**

- **El motor**, en `lib/asteroids.ts`: módulo puro, sin `document`, sin `window` y sin canvas, igual que `lib/tetris.ts`.
- **El componente**, en `components/asteroids-game.tsx`: canvas, bucle de `requestAnimationFrame`, teclado y mandos de pantalla.
- **Dos objetos** que sueltan los asteroides al romperse: `3x` (disparo triple) y escudo temporal, con su leyenda visible dentro de la pantalla.
- **Una columna lateral** dentro del CRT con los mandos de movimiento, el botón de disparo y esa leyenda, con el mismo lenguaje visual que la cruceta de `TETRIX`.
- **Un registro de motores** en `components/game-player.tsx` que sustituye al `game.id === "tetrix"` de SPEC 13.
- **Tokens de color `--rock-*`** en `app/globals.css`, derivados de la paleta de la web.
- **Un fondo retro** dibujado en el canvas: rejilla en perspectiva estilo synthwave.
- **La entrada del catálogo** reescrita y una captura real en `public/juegos/asteroides.png`.
- **Tests** en `tests/screens.spec.ts` y las capturas de referencia afectadas.
- **Documentación**: `README.md` y `CLAUDE.md`.

**Fuera (para specs futuras):**

- **Persistir puntuaciones.** El motor calcula una de verdad, pero `GUARDAR PUNTUACIÓN` sigue siendo decorativo. Guardar exige tabla, RLS y migración: es una spec propia, igual que lo era para `TETRIX`.
- **OVNIs, hiperespacio y sonido.** La referencia los menciona en su README pero no los implementa. Aquí tampoco.
- **Convertir los otros cinco juegos decorativos.** Uno por spec.
- **Arreglar `lib/scores.ts`** para que las semillas no dependan de la longitud del id. Cambiarlo reescribe las doce tablas de la aplicación y todas las capturas.
- **Marcador de máximas reales.** El `best` del catálogo sigue siendo un número inventado.

---

## 3. Diseño

### 3.1 Catálogo (`lib/games.ts`)

La entrada `rocas` se sustituye por:

```ts
{
  id: "asteroides",
  title: "ASTEROIDES",
  short: "Pulveriza rocas a la deriva y recoge lo que sueltan.",
  long: "Tu nave flota en gravedad cero: gira, empuja y dispara para partir cada roca en fragmentos más pequeños y rápidos. Al romperlas caen objetos — disparo triple y escudo — que duran unos segundos. Una sola vida: el primer impacto termina la partida.",
  cat: "SHOOTER",
  cover: "cover-rocas",
  image: "/juegos/asteroides.png",
  color: "yellow",
  best: 62840,
  plays: "15.6K",
}
```

Se conserva `cover: "cover-rocas"` como respaldo del dibujo CSS: `image` lo tapa, pero la clase sigue existiendo y no hay motivo para borrarla. La posición dentro de `GAMES` no cambia (quinta), así que sigue entrando en el `GAMES.slice(0, 6)` de la portada.

### 3.2 El motor (`lib/asteroids.ts`)

Módulo puro. El estado se muta en sitio, por el mismo motivo que en `lib/tetris.ts`: el componente lo guarda en un `useRef` y no quiere reasignar nada sesenta veces por segundo.

```ts
export const WORLD_W = 800;
export const WORLD_H = 600;
export const LIVES = 1;
export const MAX_ROCKS = 10;

export type Size = 1 | 2 | 3;
export type DropKind = "triple" | "shield";

export type Bullet = { x: number; y: number; vx: number; vy: number; ttl: number };
export type Rock = { x: number; y: number; vx: number; vy: number; size: Size; rot: number; rotSpeed: number; verts: number[][] };
export type Drop = { x: number; y: number; vx: number; vy: number; kind: DropKind; ttl: number };
export type Particle = { x: number; y: number; vx: number; vy: number; ttl: number; life: number };
export type Ship = { x: number; y: number; angle: number; vx: number; vy: number; thrusting: boolean; invincible: number; cooldown: number; triple: number; shield: number };

/** Lo que el componente lee del teclado y de los mandos, ya mezclado. */
export type Input = { left: boolean; right: boolean; thrust: boolean; fire: boolean };

export type AsteroidsState = {
  ship: Ship;
  bullets: Bullet[];
  rocks: Rock[];
  drops: Drop[];
  particles: Particle[];
  score: number;
  lives: number;
  level: number;
  /** true tras el choque: el reproductor abre el modal. */
  over: boolean;
};

export function createState(): AsteroidsState;
export function rocksForLevel(level: number): number;
export function step(state: AsteroidsState, input: Input, dt: number): void;
```

`step` es la única función que muta y empieza, como todas las de `lib/tetris.ts`, con `if (state.over) return;`.

**Reglas que se conservan de la referencia**, con sus números: giro 3,5 rad/s, empuje 260 px/s², radios `[0, 16, 30, 50]`, velocidades base `[0, 85, 55, 32]` con ruido de ±15, puntos `[0, 100, 50, 20]`, bala a 520 px/s con 1,1 s de vida, cadencia 0,2 s, morro a 21 px, distancia de seguridad 130 px al generar una oleada, apertura del disparo triple 0,18 rad, factor 0,82 en la colisión contra la nave, y `dt` topado en 0,05 s.

**Reglas que cambian**, cada una con su motivo:

- **Rozamiento por segundo, no por fotograma.** La referencia hace `v *= 0.987` en cada vuelta del bucle, así que la velocidad máxima de la nave depende de los fotogramas por segundo del monitor. Aquí: `const DRAG = 0.987 ** 60` (≈ 0,4565 por segundo) y `v *= DRAG ** dt`. A 60 fps el comportamiento es idéntico; a 120 fps o con el bucle irregular deja de serlo.
- **Una vida.** `LIVES = 1`. El choque pone `lives = 0` y `over = true` en el mismo fotograma. Desaparecen el estado «muerto», el temporizador de 2 s y la reaparición.
- **Invulnerabilidad conservada.** 3 s al crear el estado y 3 s al empezar cada oleada, porque la nave vuelve al centro con el campo ya poblado.
- **Disparo mantenido.** `input.fire` es un estado, no un flanco: mientras esté a `true` sale una bala cada vez que `cooldown` llega a cero. Es la única forma de que el botón de pantalla sea jugable.
- **Oleadas topadas en asteroides, no en nivel.** `rocksForLevel(level) = Math.min(MAX_ROCKS, 3 + level)`. El nivel sigue subiendo sin límite; a partir del séptimo la oleada se queda en 10 rocas.
- **Dos objetos.** Ver 3.2.1.
- **Puntuación sin multiplicador de nivel.** `TETRIX` multiplica por el nivel; aquí no. 20 / 50 / 100 se leen directamente y la tabla de puntos sigue siendo la de la referencia.

#### 3.2.1 Los dos objetos

| Objeto | `kind` | Efecto | Duración |
| --- | --- | --- | --- |
| Disparo triple | `"triple"` | `tryShoot` devuelve tres balas con apertura ±0,18 rad | 5 s |
| Escudo | `"shield"` | El siguiente choque consume el escudo en vez de terminar la partida: la roca explota y suma sus puntos | 5 s o un impacto, lo que llegue antes |

Reglas de caída, comunes a los dos:

- Solo puede haber **un objeto en pantalla**. Mientras exista uno, ningún asteroide suelta nada.
- Sin objeto en pantalla, cada asteroide destruido tira un 15 %. Al quinto asteroide destruido sin que haya caído nada, el siguiente cae garantizado.
- El tipo se sortea 50/50 en el momento de caer.
- El objeto deriva a 20–40 px/s, envuelve por los bordes, vive 12 s y parpadea los dos últimos.
- Recogerlo **fija** el temporizador a 5 s; no se acumula.

El escudo es diseño nuevo, no porte: la referencia solo tiene el `3x`. Su motivo es que la leyenda pedida por el usuario tenga más de una entrada y que una sola vida no sea una condena a la primera distracción.

### 3.3 El componente (`components/asteroids-game.tsx`)

Mismas props que `TetrisGame`, con el tipo compartido de 3.6:

```ts
export function AsteroidsGame({ paused, onTogglePause, onRun, onOver }: EngineProps)
```

Y los mismos patrones, copiados deliberadamente de `components/tetris-game.tsx`:

- Los tres callbacks se espejan en refs para que el bucle no se reinicie cuando el padre repinta.
- `context2d()` lee `window.devicePixelRatio`, ajusta `canvas.width/height` solo cuando cambian y aplica `setTransform(dpr, 0, 0, dpr, 0, 0)`. El tamaño lógico es `WORLD_W × WORLD_H`; el CSS lo escala.
- Los colores se leen **una sola vez al montar** con `getComputedStyle(document.documentElement).getPropertyValue(...)`, con un `ROCK_FALLBACK` literal por si el CSS no ha cargado.
- `publish()` compara `score`, `lives` y `level` con lo último enviado y solo entonces llama a `onRun`.
- El bucle sale si `paused || state.over`, y al terminar llama a `onOver()` una vez y no vuelve a programarse.

Diferencias propias de este juego:

- **El bucle pasa `dt` real**, no un acumulador de intervalos: `step(state, inputRef.current, dt)` con `dt` en segundos. `TETRIX` avanza a saltos discretos; aquí el movimiento es continuo.
- **`inputRef` es el único canal de entrada.** Teclado y punteros escriben en el mismo objeto `Input`; el motor no sabe de dónde viene cada bandera. El pad **no** usa `setInterval` como el de `TETRIX`: marca la bandera en `pointerdown` y la borra en `pointerup`, `pointercancel` y `pointerleave`.
- **Teclado:** `ArrowLeft` / `ArrowRight` giran, `ArrowUp` empuja, `Space` dispara, `KeyP` alterna la pausa llamando a `onTogglePause`. Todas con `preventDefault()`, para que `Space` no desplace la página. `keyup` limpia la bandera correspondiente, y un efecto de limpieza las pone todas a `false` al desmontar o al pausar, para que no quede un giro pegado.
- **Dentro del canvas solo se dibuja el temporizador del efecto activo**, arriba a la izquierda: `3x 4.2S` en magenta o `ESCUDO 2.8S` en verde. Puntuación, vidas y nivel **no** se dibujan: son del HUD común.
- **El dibujo conserva la estética de la referencia**: polígonos en trazo, sin relleno, con la llama del propulsor parpadeando y las partículas de explosión como trazos que se desvanecen. Lo que cambia es el color (3.5) y el fondo (3.4.1).

### 3.4 Reparto dentro de `.crt-screen`

En escritorio, el mismo esquema que `TETRIX`: el campo de juego a la izquierda y una columna a la derecha.

```
┌──────────────────────────────────────────────┬───────────────┐
│                                              │  MOVIMIENTO   │
│                                              │    ┌───┐      │
│            campo de juego 4:3                │    │ ▲ │      │
│            (canvas 800 × 600)                │ ┌──┼───┼──┐   │
│                                              │ │ ◀ │   │ ▶ │ │
│                                              │ └──┴───┴──┘   │
│                                              │               │
│                                              │   DISPARO     │
│                                              │  ┌─────────┐  │
│                                              │  │  ◉ FUEGO│  │
│                                              │  └─────────┘  │
│                                              │   OBJETOS     │
│                                              │  3x  TRIPLE   │
│                                              │  ◎   ESCUDO   │
└──────────────────────────────────────────────┴───────────────┘
```

Aritmética a 1440 px de ancho: `.av-player` da 1052 px de contenido, `.crt` resta 48 px de relleno, así que `.crt-screen` mide 1004 × 753. El escenario resta 18 px de relleno por lado y 20 px de hueco; la columna se lleva 180 px (tope de `clamp(84px, 22%, 180px)`). Al campo le quedan 768 px de ancho, y a 4:3 son 576 px de alto, por debajo de los 717 disponibles: manda el ancho y el mundo de 800 × 600 se dibuja a escala 0,96. Prácticamente 1:1.

A 390 px esa cuenta se rompe: `.crt-screen` mide 310 px de ancho y la columna de 84 px dejaría el campo en 202 × 151. Por eso en móvil el escenario **se apila**: el campo ocupa todo el ancho y los mandos pasan debajo, en una fila con la cruceta a la izquierda y el botón de fuego a la derecha, con la leyenda al pie. Con `aspect-ratio: 3 / 4` la pantalla pasa a 310 × 413; el campo se lleva 294 × 220 y quedan 169 px para mandos (93 px de cruceta) y leyenda (unos 30 px).

Clases nuevas en `app/globals.css`, en un bloque hermano del de `TETRIX` y con prefijo propio: `.rocks-stage`, `.rocks-field`, `.rocks-side`, `.rocks-block`, `.rocks-side .l`, `.rocks-pad` con `.pad-thrust` / `.pad-left` / `.pad-right`, `.pad-fire` y `.rocks-legend` con sus `li`. Los botones siguen siendo `.btn`, con el mismo `touch-action: manipulation` y `user-select: none` que los de la cruceta de `TETRIX`.

#### 3.4.1 El fondo

El campo no es negro plano. Antes de todo lo demás, el canvas dibuja:

1. El mismo degradado radial azul-negro que usa `.tetris-stage` (`#0a0030` al centro, `#000` al 70 %), para que las dos pantallas jugables se reconozcan como la misma casa.
2. Una línea de horizonte magenta tenue a media altura, con un resplandor corto por encima.
3. Una rejilla en perspectiva cian por debajo del horizonte: líneas horizontales cada vez más juntas hacia el fondo y líneas de fuga hacia un punto central.

La rejilla se dibuja **quieta y muy tenue** (alfa por debajo de 0,15). El juego envuelve por los bordes: si la rejilla se moviera o tuviera contraste, sugeriría un suelo sólido y desorientaría al salir por abajo y entrar por arriba.

### 3.5 Tokens de color (`--rock-*`)

Bloque nuevo en `:root`, junto a los `--piece-*`:

```css
/* ASTEROIDES — los mismos neones de la web, repartidos por elemento */
--rock-ship: #00f5ff; /* = --cyan */
--rock-rock: #8a5cff; /* = --piece-j, violeta */
--rock-bullet: #f5ff00; /* = --yellow */
--rock-flame: #ff5a1f; /* = --piece-z, ámbar */
--rock-triple: #ff006e; /* = --magenta */
--rock-shield: #00ff88; /* = --green */
--rock-grid: rgba(0, 245, 255, 0.14);
--rock-horizon: rgba(255, 0, 110, 0.35);
```

No entran en el bloque `@theme inline`: como los `--piece-*`, nadie los usa como utilidades de Tailwind. Las partículas de explosión se quedan en blanco con alfa, que es lo que las hace legibles sobre cualquiera de los otros colores.

### 3.6 Registro de motores (`components/game-player.tsx`)

SPEC 13 dejó escrito que la bifurcación de una línea se convertiría en registro cuando existiera el segundo motor. Existe:

```ts
export type EngineRun = { score: number; lives: number; level: number };
export type EngineProps = {
  paused: boolean;
  onTogglePause: () => void;
  onRun: (run: EngineRun) => void;
  onOver: () => void;
};

const ENGINES: Record<string, { Component: ComponentType<EngineProps>; lives: number; screen: string }> = {
  tetrix: { Component: TetrisGame, lives: TETRIX_LIVES, screen: "tetris" },
  asteroides: { Component: AsteroidsGame, lives: ASTEROIDS_LIVES, screen: "rocks" },
};
```

`screen` es el modificador que se añade a `.crt-screen`. `const engine = ENGINES[game.id]` sustituye al booleano `playable`, y donde antes había `playable ? ... : ...` ahora hay `engine ? <engine.Component .../> : <escena decorativa/>`. El tipo `EngineRun` vive en un sitio y `TetrisRun` pasa a ser su alias, para no tocar `components/tetris-game.tsx`.

**El resto del reproductor no cambia:** HUD, pausa, `FIN`, el modal con sus tres ramas, la invitación al invitado, la ida y vuelta por `/auth`, `key={runKey}` como reinicio y el `ignoreRun` que protege la partida recuperada.

### 3.7 Tests

Bloque nuevo en `tests/screens.spec.ts`, junto al de `tetrix` y con su misma advertencia: **no se congela el reloj**, porque el bucle necesita `requestAnimationFrame` vivo.

- Arranca con el campo, los mandos y la leyenda: el canvas con su `aria-label`, los tres botones de movimiento más el de disparo, los rótulos `MOVIMIENTO` / `DISPARO` / `OBJETOS`, las dos entradas de la leyenda, el HUD a `0` / `♥` / `01` y la clase `rocks` en `.crt-screen`.
- `Space` dispara y no desplaza la página: `window.scrollY` no cambia.
- `PAUSA` muestra `EN PAUSA` y congela la puntuación durante un segundo.
- Un id desconocido sigue devolviendo 404, ahora comprobado también con `rocas`.

No se añade captura de referencia del juego: el campo se genera al azar, igual que el orden de piezas de `TETRIX`.

Se actualizan los tests existentes que nombran `ROCAS` y se regeneran las capturas de `home`, `biblioteca` y `salon` en `desktop` y `mobile`. Las de `detalle`, `reproductor`, `auth` y `acerca` no deben moverse.

### 3.8 Documentación

- `README.md`: fila nueva en el índice de specs, «seis de los siete juegos son decorativos» pasa a «cinco de los siete», la tabla de rutas menciona los dos motores, el árbol del proyecto suma `lib/asteroids.ts` y `components/asteroids-game.tsx`, y el apartado de pruebas suma el bloque nuevo.
- `CLAUDE.md`: el párrafo que declara `TETRIX` como única excepción pasa a describir dos motores y el registro `ENGINES`, conservando las dos reglas que siguen vigentes — el HUD es común y la puntuación no se persiste.

---

## 4. Plan de implementación

Cada paso deja el proyecto compilando y la suite en un estado conocido.

1. **Catálogo.** Sustituir la entrada `rocas` por `asteroides` en `lib/games.ts`, sin `image` todavía. _Comprobación:_ `/juego/asteroides` responde 200, `/juego/rocas` responde 404 y la tarjeta aparece en la biblioteca con el filtro `SHOOTER`.
2. **Tokens.** Añadir el bloque `--rock-*` a `:root` en `app/globals.css`. _Comprobación:_ `npm run lint` limpio y los tokens visibles en las herramientas del navegador.
3. **Motor, primera mitad.** Crear `lib/asteroids.ts` con constantes, tipos, `createState`, `rocksForLevel`, la generación de oleadas y la envolvente toroidal. _Comprobación:_ `npx tsc --noEmit` limpio.
4. **Motor, segunda mitad.** Completar `step`: nave, balas, asteroides, colisiones, objetos, partículas, subida de oleada y fin de partida. _Comprobación:_ `npx tsc --noEmit` limpio; el módulo no menciona `document`, `window` ni `ctx`.
5. **Componente, solo teclado.** Crear `components/asteroids-game.tsx` con canvas, `devicePixelRatio`, dibujo y bucle, sin mandos de pantalla. _Comprobación:_ montándolo a mano en `/jugar/asteroides` se juega con el teclado.
6. **Registro de motores.** Sustituir `PLAYABLE_ID` por `ENGINES` en `components/game-player.tsx` y añadir el modificador `.crt-screen.rocks`. _Comprobación:_ `TETRIX` sigue funcionando igual y `ASTEROIDES` monta su motor.
7. **Columna lateral.** Mandos táctiles, leyenda de objetos y CSS `.rocks-*`, incluida la regla de móvil que apila el escenario. _Comprobación:_ a 390 px se juega con el pulgar y no hay desplazamiento horizontal.
8. **Fondo y temporizador.** Rejilla synthwave, horizonte y el indicador del efecto activo dentro del canvas. _Comprobación:_ a simple vista, y el campo sigue legible con un objeto activo.
9. **Cierre.** Captura `public/juegos/asteroides.png`, tests nuevos, capturas de referencia regeneradas y documentación. _Comprobación:_ `npm test`, `npx tsc --noEmit` y `npm run lint` limpios.

---

## 5. Criterios de aceptación

- [ ] `/juego/asteroides` y `/jugar/asteroides` responden 200; `/juego/rocas` y `/jugar/rocas` responden 404.
- [ ] La biblioteca sigue mostrando siete tarjetas y el filtro `SHOOTER` muestra `ASTEROIDES`.
- [ ] La tarjeta de `ASTEROIDES` usa la captura `/juegos/asteroides.png`, no el dibujo CSS.
- [ ] `/jugar/asteroides` monta un `<canvas>` con `aria-label` y **no** la escena decorativa `.game-arena`.
- [ ] El HUD muestra `0` de puntuación, un único `♥` y el nivel `01` al arrancar.
- [ ] Dentro del canvas no se dibuja ni puntuación, ni vidas, ni nivel.
- [ ] Dentro de la pantalla hay tres botones de movimiento, un botón de disparo y los rótulos `MOVIMIENTO`, `DISPARO` y `OBJETOS`.
- [ ] La leyenda muestra dos entradas: disparo triple y escudo, cada una con su color.
- [ ] `ArrowLeft` y `ArrowRight` giran la nave, `ArrowUp` la empuja.
- [ ] Mantener `Space` dispara en cadencia; el disparo no espera a que se suelte la tecla.
- [ ] Ninguna tecla del juego desplaza la página: `window.scrollY` no cambia al pulsarlas.
- [ ] Destruir un asteroide grande suma 20 puntos, uno mediano 50 y uno pequeño 100.
- [ ] Un asteroide grande se parte en dos medianos y cada mediano en dos pequeños; el pequeño desaparece.
- [ ] Vaciar el campo sube el nivel y genera `min(10, 3 + nivel)` asteroides nuevos.
- [ ] A partir del nivel 7 cada oleada trae exactamente 10 asteroides y el nivel sigue subiendo.
- [ ] Recoger `3x` dispara tres balas durante 5 s y el indicador del efecto aparece dentro del canvas con su cuenta atrás.
- [ ] Recoger el escudo permite sobrevivir a un choque; el segundo choque termina la partida.
- [ ] Nunca hay más de un objeto en el campo a la vez.
- [ ] Chocar sin escudo pone las vidas a `—` y abre el modal `FIN DEL JUEGO` con la puntuación alcanzada.
- [ ] El botón `PAUSA` congela el juego, muestra `EN PAUSA` y la puntuación no avanza; `REANUDAR` continúa la misma partida.
- [ ] La tecla `P` hace lo mismo que el botón `PAUSA`, en los dos sentidos.
- [ ] `FIN` abre el modal y detiene el bucle.
- [ ] `JUGAR DE NUEVO` reinicia la partida a 0 puntos, una vida y nivel 1.
- [ ] Con sesión real, el modal muestra `GUARDAR PUNTUACIÓN` y, al pulsarlo, `▸ PUNTUACIÓN GUARDADA_`; nada se escribe en ningún sitio.
- [ ] Con sesión de invitado, el modal **no** muestra `GUARDAR PUNTUACIÓN`, sino la invitación a iniciar sesión.
- [ ] Esa invitación lleva a `/auth?next=` con `/jugar/asteroides?puntuacion=&nivel=` codificado, y al volver con sesión el modal reaparece con esa puntuación.
- [ ] `TETRIX` sigue comportándose exactamente igual: mismo tablero, mismos mandos, mismo modal.
- [ ] A 390 px de ancho el escenario apila campo y mandos, los botones miden al menos 44 px de alto y no hay desplazamiento horizontal.
- [ ] Solo cambian las capturas de referencia de `home`, `biblioteca` y `salon`, en los dos proyectos; las de `detalle`, `reproductor`, `auth` y `acerca` quedan idénticas.
- [ ] `lib/asteroids.ts` no contiene las palabras `document`, `window` ni `canvas`.
- [ ] `npm test`, `npx tsc --noEmit` y `npm run lint` terminan limpios.
- [ ] No se modifican `lib/tetris.ts`, `components/tetris-game.tsx`, ni el HUD y el modal de `components/game-player.tsx` más allá del registro de motores.

---

## 6. Decisiones

- **Sí:** `ROCAS` se convierte en `ASTEROIDES` en vez de añadir un octavo juego. Dos naves disparando a rocas en el mismo catálogo son la misma idea contada dos veces.
- **Sí:** id nuevo `asteroides`. El id es también la URL y el título; que `/jugar/rocas` abriera un juego llamado `ASTEROIDES` sería una deuda de lectura para siempre.
- **No:** conservar el id `rocas` para no mover las tablas falsas. Las tablas son ruido generado por una LCG; la coherencia del nombre dura más.
- **Sí:** asumir que la clasificación de `ASTEROIDES` salga idéntica a la de `SERPENTINA` por tener ambos 10 caracteres. Arreglar la semilla reescribe las doce tablas y todas las capturas; es una spec propia, si alguna vez importa.
- **Sí:** columna lateral como la de `TETRIX`. Es el mismo mueble y el jugador ya sabe dónde mirar.
- **No:** mandos superpuestos sobre el campo. Más fieles al arcade, pero tapan justo la zona donde aparecen los asteroides y obligan a inventar un lenguaje visual nuevo.
- **Sí:** clases nuevas con prefijo `.rocks-*` en un bloque hermano. Duplica unas cuarenta líneas de CSS.
- **No:** renombrar `.tetris-*` a clases genéricas compartidas. Ahorraría esas líneas a cambio de tocar el juego que ya funciona, romper cuatro selectores de la suite y arriesgar las capturas de `TETRIX`. La abstracción se hace cuando duela, no antes.
- **Sí:** dos objetos, `3x` y escudo. Una leyenda con una sola entrada no es una leyenda, y una vida sin red se agota antes de que el jugador entienda el juego.
- **No:** un tercer objeto de puntos dobles. Multiplicar la puntuación descoloca los 20/50/100 que la leyenda promete.
- **Sí:** un solo objeto en pantalla, sin límite por oleada. Con dos tipos, el límite de uno por oleada de la referencia dejaría el escudo casi invisible.
- **Sí:** una vida, como `TETRIX`. Es la regla de la casa para los motores reales y hace que el marcador signifique algo.
- **Sí:** 3 s de invulnerabilidad al arrancar y en cada oleada. La nave aparece en el centro con el campo ya poblado; morir por aparecer no es una decisión del jugador.
- **Sí:** disparo mantenido en teclado y en táctil. Con la cadencia de 0,2 s el juego no se vuelve trivial, y martillear un botón en el móvil no es jugar.
- **Sí:** rozamiento por segundo en vez de por fotograma. El bucle de React no garantiza 60 fps y la referencia ata la velocidad máxima de la nave al monitor.
- **No:** copiar el rozamiento tal cual «por fidelidad». La fidelidad que importa es la del tacto, no la del error.
- **Sí:** nivel sin tope y oleada topada en 10 rocas. El tope de `TETRIX` está en el nivel porque allí el nivel es la velocidad; aquí el nivel es solo un contador de oleadas y lo que se vuelve injugable es la cantidad de rocas.
- **Sí:** puntuación sin multiplicador de nivel. La tabla 20/50/100 es parte de lo que el jugador aprende mirando.
- **Sí:** tokens `--rock-*` propios. Leer `--piece-j` para pintar un asteroide sería confuso dentro de seis meses.
- **No:** colorear los asteroides por tamaño. Se lee bien, pero mete tres neones más en un campo que ya tiene nave, balas, llama y objetos.
- **Sí:** rejilla synthwave quieta y tenue. Es el efecto retro que se pidió, con el contraste bajo suficiente para no competir con los asteroides violeta.
- **No:** rejilla en movimiento. En un mundo que envuelve por los bordes, un suelo que avanza promete una dirección que no existe.
- **Sí:** el indicador del efecto activo se dibuja dentro del canvas. Es estado del juego, no del jugador, y sacarlo al HUD obligaría a repintar React sesenta veces por segundo.
- **No:** sacar vidas, puntuación o nivel al canvas. Esa es la frontera que SPEC 13 trazó y sigue en pie.
- **Sí:** registro `ENGINES` en el reproductor. Es exactamente el segundo caso que SPEC 13 puso como condición para crearlo.
- **Sí:** captura real en `public/juegos/asteroides.png`, generada con el juego ya funcionando. Es lo que se hizo con `TETRIX`: solo se fotografía lo que existe.
- **No:** persistir la puntuación. Sigue haciendo falta tabla, RLS y migración; nada de eso cabe aquí.
- **No:** OVNIs, hiperespacio ni sonido. La referencia tampoco los tiene.
- **No:** captura de referencia del juego en la suite. El campo es aleatorio y la captura sería una lotería roja.

---

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La rejilla en perspectiva sugiere un suelo y desorienta en un mundo que envuelve | Se dibuja quieta, por debajo del horizonte y con alfa menor que 0,15; si en revisión sigue estorbando, se baja el alfa antes de tocar la geometría |
| La clasificación falsa de `ASTEROIDES` es idéntica a la de `SERPENTINA` | Es ruido decorativo y el catálogo ya tenía el mismo solape entre `tetrix` y `gloton`; queda anotado como deuda conocida en el apartado «Fuera» |
| `/juego/rocas` y `/jugar/rocas` dejan de existir | No hay enlaces externos conocidos a esas URL y no ha habido un despliegue que las promocionara |
| El campo a 390 px queda demasiado pequeño para jugar | El escenario se apila en móvil y la pantalla pasa a 3/4, igual que hizo `TETRIX`; la cuenta de píxeles está en 3.4 |
| Dibujar rejilla, partículas y polígonos cada fotograma cuesta en móvil | La rejilla es estática y puede precalcularse en un canvas fuera de pantalla si el perfil lo pide; las partículas ya están limitadas por su vida |
| El disparo mantenido hace el juego más fácil que la referencia | La cadencia de 0,2 s no cambia y las rocas pequeñas valen 100 puntos: la dificultad está en esquivar, no en teclear |
| Regenerar capturas a ciegas convierte una regresión en la nueva base | Las tres capturas afectadas se revisan a mano en el navegador antes de regenerarlas, y solo se regenera el proyecto que cambió |
| El registro `ENGINES` rompe `TETRIX` al refactorizar | Los tests de `tetrix` ya existen y cubren montaje, hard drop y pausa; se ejecutan antes y después del paso 6 |

---

## Lo que **no** entra en esta spec

- Guardar puntuaciones de verdad: tabla, RLS y migración.
- OVNIs, hiperespacio y sonido.
- Convertir en jugables los otros cinco juegos decorativos.
- Cambiar las semillas de `lib/scores.ts` para que no dependan de la longitud del id.
- Un marcador de máximas reales que sustituya al `best` inventado del catálogo.

Cada una de ellas, si llega, va en su propia spec.
