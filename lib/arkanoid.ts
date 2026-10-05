/**
 * Motor de ARKANOID. Módulo puro: sin `document`, sin `window`, sin canvas.
 *
 * Portado de `references/started-games/04-arkanoid/` con cuatro cambios de
 * regla, decididos en la SPEC 15: niveles infinitos (los cinco muros de la
 * referencia y, del sexto en adelante, generación determinista), curva de
 * velocidad de dos tramos con techo, rebote en la pala que depende del punto
 * de impacto —la referencia sólo invertía la vertical— y subpasos para que la
 * bola no atraviese nada a velocidad máxima. Las vidas (tres, como la
 * referencia) llegan como parámetro de `createState()` desde `games.vidas`
 * (SPEC 18), no como constante fija.
 *
 * La SPEC 24 añade premios que caen al romper un ladrillo, copiando el
 * vocabulario `Drop`/`DropKind`/`DROP_CHANCE` de `lib/asteroids.ts`: una
 * segunda bola (`balls[]` sustituye al `ball` singular, y `serving` pasa de
 * ser del estado a ser de cada bola) y un ensanche de pala que persiste entre
 * niveles y se pierde al perder una vida.
 *
 * El estado se muta in situ a propósito: el componente lo guarda en un `useRef`
 * y pinta en un canvas, así que un objeto nuevo por fotograma no aportaría nada.
 */

/** Espacio lógico del juego, heredado de la referencia. */
export const WIDTH = 800;
export const HEIGHT = 600;

export const BRICK_COLS = 10;
export const BRICK_ROWS = 6;
export const BRICK_W = 64;
export const BRICK_H = 24;
export const ORIGIN_X = (WIDTH - BRICK_COLS * BRICK_W) / 2; // 80
export const ORIGIN_Y = 80;

/** Duración del destello de un ladrillo roto, en ms. */
export const BURST_MS = 150;

/** Ancho base de la pala, antes de cualquier ensanche. */
export const PADDLE_W = 81;
const PADDLE_H = 14;
const PADDLE_Y = 560;
const BALL_SIZE = 16;

/** Ángulo máximo del rebote en la pala, medido desde la vertical. */
const MAX_BOUNCE = (60 * Math.PI) / 180;

/** Ángulo del saque, medido desde la vertical. */
const SERVE_ANGLE = (30 * Math.PI) / 180;

/** Curva de velocidad: dos tramos y un techo (§3.2 de la SPEC 15). */
const V0 = 224; // ≈ 0,62 × la referencia
const SLOW_STEP = 1.04; // niveles 1–10
const FAST_STEP = 1.07; // niveles 11 en adelante
const V_MAX = 800;

/**
 * Avance máximo de la bola por subpaso, en px. Un tercio del alto de un
 * ladrillo y la mitad del lado de la bola: ningún obstáculo cabe entre dos
 * posiciones consecutivas.
 */
const MAX_STEP_PX = 8;

/** Lado del premio que cae, en px. Igual que `BALL_SIZE`: se lee a la misma distancia. */
const DROP_SIZE = 16;
/** Velocidad de caída del premio, en px/s. Más lento que la bola del nivel 1. */
const DROP_SPEED = 180;
/** Ensanche de la pala por cada lado, por premio recogido. */
export const WIDEN_PER_PICK = 15;
/** Tope de ensanches acumulados. */
const MAX_WIDENINGS = 3;
/** Tope duro de bolas en pantalla. */
const MAX_BALLS = 2;
/** Probabilidad de que un ladrillo roto suelte un premio, por tipo. */
const DROP_CHANCE = 0.15;

/** 1–7: índice de color de ladrillo. Nunca 0: un ladrillo muerto se marca con `alive`. */
export type BrickType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Brick = {
  x: number;
  y: number;
  w: number;
  h: number;
  type: BrickType;
  alive: boolean;
};

/** Destello de un ladrillo recién roto; se desvanece en BURST_MS. */
export type Burst = {
  x: number;
  y: number;
  w: number;
  h: number;
  type: BrickType;
  elapsed: number;
};

/** Las dos habilidades. Mismo patrón que `DropKind` en lib/asteroids.ts. */
export type DropKind = "ball" | "paddle";

/** Premio que cae: recto, a velocidad constante, sin física. */
export type Drop = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: DropKind;
};

export type Ball = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  /** Pegada a la pala esperando saque. Es de la bola, no del estado. */
  serving: boolean;
};

export type ArkanoidState = {
  paddle: { x: number; y: number; w: number; h: number };
  balls: Ball[];
  bricks: Brick[];
  bursts: Burst[];
  drops: Drop[];
  /** Ensanches acumulados, 0-3. Persiste entre niveles. */
  widenings: number;
  /** Premios ya soltados en este nivel, uno por tipo. Se resetea al subir. */
  droppedThisLevel: Record<DropKind, boolean>;
  score: number;
  level: number;
  lives: number;
  /** Saques de esta partida; decide hacia qué lado sale la bola. */
  serves: number;
  /** true cuando se pierde la última vida: el reproductor abre el modal. */
  over: boolean;
  /** Sorteo de si un ladrillo roto suelta premio (SPEC 36); seedeable para el replay en servidor. */
  rng: () => number;
};

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Los cinco muros de `references/started-games/04-arkanoid/levels.js`, con los
 * colores traducidos a los tokens `--brick-*` de §3.3:
 * 1 cian · 2 magenta · 3 amarillo · 4 verde · 5 ámbar · 6 violeta · 7 plata.
 */
const CYAN = 1;
const MAGENTA = 2;
const YELLOW = 3;
const GREEN = 4;
const AMBER = 5; // el rojo de la referencia
const VIOLET = 6; // el hotpink de la referencia
const SILVER = 7; // el gray de la referencia

type Cell = { col: number; row: number; type: BrickType };

function handmade(level: number): Cell[] {
  const cells: Cell[] = [];

  if (level === 1) {
    const rowTypes = [AMBER, YELLOW, CYAN, MAGENTA, VIOLET, GREEN] as const;
    for (let row = 0; row < BRICK_ROWS; row++)
      for (let col = 0; col < BRICK_COLS; col++)
        cells.push({ col, row, type: rowTypes[row] });
    return cells;
  }

  if (level === 2) {
    const rowTypes = [SILVER, CYAN, VIOLET, YELLOW, MAGENTA, GREEN] as const;
    const start = [4, 3, 2, 1, 0, 0];
    const end = [5, 6, 7, 8, 9, 9];
    for (let row = 0; row < BRICK_ROWS; row++)
      for (let col = start[row]; col <= end[row]; col++)
        cells.push({ col, row, type: rowTypes[row] });
    return cells;
  }

  if (level === 3) {
    for (let row = 0; row < BRICK_ROWS; row++)
      for (let col = 0; col < BRICK_COLS; col++)
        if ((col + row) % 2 === 0)
          cells.push({ col, row, type: row < 3 ? YELLOW : MAGENTA });
    return cells;
  }

  if (level === 4) {
    const rowTypes = [CYAN, MAGENTA, GREEN, YELLOW, VIOLET, AMBER] as const;
    const gaps = [
      [2, 5, 8],
      [0, 4, 7, 9],
      [1, 3, 6],
      [2, 5, 8, 9],
      [0, 4, 7],
      [1, 3, 6, 9],
    ];
    for (let row = 0; row < BRICK_ROWS; row++)
      for (let col = 0; col < BRICK_COLS; col++)
        if (!gaps[row].includes(col))
          cells.push({ col, row, type: rowTypes[row] });
    return cells;
  }

  // Nivel 5: marco con cruz.
  for (let row = 0; row < BRICK_ROWS; row++)
    for (let col = 0; col < BRICK_COLS; col++) {
      const isFrame = col === 0 || col === 9 || row === 0 || row === 5;
      const isCross = col === 4 || row === 2;
      if (isFrame || isCross)
        cells.push({ col, row, type: isCross && !isFrame ? VIOLET : CYAN });
    }
  return cells;
}

/**
 * Muros del nivel 6 en adelante. Congruencial lineal idéntico al de
 * `seededScores` en `lib/scores.ts`, copiado a propósito: el motor no importa
 * nada del módulo de datos falsos. Sembrado con el número de nivel, así que el
 * mismo nivel devuelve siempre el mismo muro en cualquier máquina.
 *
 * Simétrico por construcción —se emite cada columna y su espejo— y con suelo de
 * contenido: si salieran menos de ocho ladrillos, se rellena la fila 0 entera.
 */
function generated(level: number): Cell[] {
  let s = (level * 7919) % 233280;
  const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;

  const rows = 4 + Math.floor(rand() * 3); // 4, 5 o 6
  const cells: Cell[] = [];

  for (let row = 0; row < rows; row++) {
    const type = (((row + level) % 7) + 1) as BrickType;
    const density = 0.55 + rand() * 0.35;
    for (let col = 0; col < BRICK_COLS / 2; col++) {
      if (rand() < density) {
        cells.push({ col, row, type });
        cells.push({ col: BRICK_COLS - 1 - col, row, type });
      }
    }
  }

  if (cells.length < 8) {
    const type = ((level % 7) + 1) as BrickType;
    for (let col = 0; col < BRICK_COLS; col++)
      cells.push({ col, row: 0, type });
  }

  return cells;
}

/** Muro del nivel. Función pura: el mismo nivel devuelve siempre el mismo muro. */
export function layout(level: number): Brick[] {
  const n = Math.max(1, level);
  const cells = n <= 5 ? handmade(n) : generated(n);

  return cells.map(({ col, row, type }) => ({
    x: ORIGIN_X + col * BRICK_W,
    y: ORIGIN_Y + row * BRICK_H,
    w: BRICK_W,
    h: BRICK_H,
    type,
    alive: true,
  }));
}

/** Módulo de la velocidad de la bola, en px/s. */
export function ballSpeed(level: number): number {
  const n = Math.max(1, level);
  const slow = V0 * SLOW_STEP ** (Math.min(n, 10) - 1);
  const v = n <= 10 ? slow : slow * FAST_STEP ** (n - 10);
  return Math.min(V_MAX, v);
}

/**
 * Velocidad de la pala, en px/s. Nunca por debajo de la bola: con los 400 px/s
 * fijos de la referencia, a partir del nivel 15 la bola cruzaría por debajo
 * antes de que la pala llegara.
 */
export function paddleSpeed(level: number): number {
  return Math.max(480, ballSpeed(level) * 1.5);
}

function createBall(): Ball {
  return {
    x: 0,
    y: 0,
    w: BALL_SIZE,
    h: BALL_SIZE,
    vx: 0,
    vy: 0,
    serving: true,
  };
}

/** Mientras `ball.serving` es true la bola sigue a la pala: se puede colocar el saque. */
function stickBall(state: ArkanoidState, ball: Ball): void {
  const { paddle } = state;
  ball.x = paddle.x + (paddle.w - ball.w) / 2;
  ball.y = paddle.y - ball.h;
  ball.vx = 0;
  ball.vy = 0;
}

/**
 * Aplica `widenings` al ancho de la pala, manteniendo su centro y recolocando
 * dentro del campo. Se llama al crecer y al encoger: en los dos casos el
 * ancho puede dejar la pala fuera del borde derecho si no se recoloca.
 */
function applyPaddleWidth(state: ArkanoidState): void {
  const { paddle } = state;
  const cx = paddle.x + paddle.w / 2;
  paddle.w = PADDLE_W + state.widenings * 2 * WIDEN_PER_PICK;
  paddle.x = clamp(cx - paddle.w / 2, 0, WIDTH - paddle.w);
}

export function createState(
  lives: number,
  rng: () => number = Math.random,
): ArkanoidState {
  const state: ArkanoidState = {
    paddle: {
      x: (WIDTH - PADDLE_W) / 2,
      y: PADDLE_Y,
      w: PADDLE_W,
      h: PADDLE_H,
    },
    balls: [],
    bricks: layout(1),
    bursts: [],
    drops: [],
    widenings: 0,
    droppedThisLevel: { ball: false, paddle: false },
    score: 0,
    level: 1,
    lives,
    serves: 0,
    over: false,
    rng,
  };
  const ball = createBall();
  stickBall(state, ball);
  state.balls.push(ball);
  return state;
}

/**
 * Lanza toda bola pegada a la pala, a 30° de la vertical, alternando el lado
 * con `serves % 2`. Determinista a propósito: sin `Math.random()` en el
 * arranque, un test puede afirmar que tras LANZAR la puntuación acaba siendo
 * mayor que cero. En la práctica sólo hay una bola `serving` a la vez: la
 * segunda bola de un premio nace pegada mientras la primera ya está en juego.
 */
export function serve(state: ArkanoidState): void {
  if (state.over) return;
  const v = ballSpeed(state.level);
  const dir = state.serves % 2 === 0 ? 1 : -1;
  let served = false;
  for (const ball of state.balls) {
    if (!ball.serving) continue;
    ball.vx = v * Math.sin(SERVE_ANGLE) * dir;
    ball.vy = -v * Math.cos(SERVE_ANGLE);
    ball.serving = false;
    served = true;
  }
  if (served) state.serves++;
}

export function movePaddle(
  state: ArkanoidState,
  dir: -1 | 1,
  dt: number,
): void {
  const { paddle } = state;
  paddle.x = clamp(
    paddle.x + dir * paddleSpeed(state.level) * dt,
    0,
    WIDTH - paddle.w,
  );
  for (const ball of state.balls) if (ball.serving) stickBall(state, ball);
}

/** Centra la pala en `cx` (coordenadas lógicas): arrastre con dedo o ratón. */
export function setPaddleX(state: ArkanoidState, cx: number): void {
  const { paddle } = state;
  paddle.x = clamp(cx - paddle.w / 2, 0, WIDTH - paddle.w);
  for (const ball of state.balls) if (ball.serving) stickBall(state, ball);
}

/** El rebote en la pala sale del punto de impacto, así que el jugador apunta. */
function bounceOffPaddle(state: ArkanoidState, ball: Ball): void {
  const { paddle } = state;
  const ballCx = ball.x + ball.w / 2;
  const paddleCx = paddle.x + paddle.w / 2;
  const offset = clamp((ballCx - paddleCx) / (paddle.w / 2), -1, 1);
  const angle = offset * MAX_BOUNCE;
  // El módulo se reimpone en cada rebote: la velocidad es siempre la del nivel
  // y no deriva con los redondeos.
  const v = ballSpeed(state.level);
  ball.vx = v * Math.sin(angle);
  ball.vy = -v * Math.cos(angle);
  ball.y = paddle.y - ball.h;
}

/**
 * Se pierde una bola. Con más en juego, sólo se quita: sin coste. Si era la
 * última, una vida menos, se pierde el último ensanche y vuelta al saque con
 * una bola nueva.
 */
function loseBall(state: ArkanoidState, ball: Ball): void {
  state.balls = state.balls.filter((b) => b !== ball);
  if (state.balls.length > 0) return;

  state.lives--;
  if (state.lives <= 0) {
    state.lives = 0;
    state.over = true;
    return;
  }
  state.widenings = Math.max(0, state.widenings - 1);
  applyPaddleWidth(state);
  const next = createBall();
  stickBall(state, next);
  state.balls.push(next);
}

/** Muro limpio: bonus, nivel nuevo, muro nuevo, premios reseteados y bola(s) al saque. */
function clearLevel(state: ArkanoidState): void {
  state.score += 100 * state.level;
  state.level++;
  state.bricks = layout(state.level);
  state.drops = [];
  state.droppedThisLevel = { ball: false, paddle: false };
  for (const ball of state.balls) {
    ball.serving = true;
    stickBall(state, ball);
  }
}

/**
 * Decide si el ladrillo roto suelta un premio: uno por tipo y por nivel, con
 * `"ball"` exigiendo además que haya exactamente una bola en pantalla —con dos
 * no aparece, y el tope duro es MAX_BALLS.
 */
function maybeDropFrom(state: ArkanoidState, brick: Brick): void {
  const kinds: DropKind[] = [];
  if (!state.droppedThisLevel.ball && state.balls.length === 1)
    kinds.push("ball");
  if (!state.droppedThisLevel.paddle) kinds.push("paddle");

  for (const kind of kinds) {
    if (state.rng() >= DROP_CHANCE) continue;
    state.drops.push({
      x: brick.x + brick.w / 2 - DROP_SIZE / 2,
      y: brick.y + brick.h / 2 - DROP_SIZE / 2,
      w: DROP_SIZE,
      h: DROP_SIZE,
      kind,
    });
    state.droppedThisLevel[kind] = true;
  }
}

/** Recoge el premio: `"ball"` añade una bola pegada; `"paddle"` ensancha. */
function collectDrop(state: ArkanoidState, drop: Drop): void {
  if (drop.kind === "ball") {
    if (state.balls.length >= MAX_BALLS) return;
    const ball = createBall();
    stickBall(state, ball);
    state.balls.push(ball);
    return;
  }
  state.widenings = Math.min(MAX_WIDENINGS, state.widenings + 1);
  applyPaddleWidth(state);
}

/**
 * Avanza los premios en caída recta, fuera del bucle de subpasos: no
 * participan en la física, así que no necesitan su precisión. Los que tocan
 * la pala se recogen; los que pasan del suelo se pierden.
 */
function advanceDrops(state: ArkanoidState, dt: number): void {
  const { paddle } = state;
  const remaining: Drop[] = [];
  for (const drop of state.drops) {
    drop.y += DROP_SPEED * dt;

    const caught =
      drop.y + drop.h > paddle.y &&
      drop.y < paddle.y + paddle.h &&
      drop.x + drop.w > paddle.x &&
      drop.x < paddle.x + paddle.w;
    if (caught) {
      collectDrop(state, drop);
      continue;
    }
    if (drop.y > HEIGHT) continue;
    remaining.push(drop);
  }
  state.drops = remaining;
}

/**
 * Un subpaso de una bola: la mueve y resuelve paredes, pala y un ladrillo
 * como mucho. Devuelve true si ha roto un ladrillo, para que `step` sepa
 * cuándo merece la pena comprobar si el muro ha quedado limpio.
 */
function advanceBall(state: ArkanoidState, ball: Ball, dt: number): boolean {
  const { paddle } = state;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Paredes izquierda, derecha y superior. La de abajo se deja abierta.
  if (ball.x <= 0) {
    ball.x = 0;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x + ball.w >= WIDTH) {
    ball.x = WIDTH - ball.w;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.y <= 0) {
    ball.y = 0;
    ball.vy = Math.abs(ball.vy);
  }

  // Pala: sólo cuenta si la bola baja, para no atraparla dentro.
  if (
    ball.vy > 0 &&
    ball.x + ball.w > paddle.x &&
    ball.x < paddle.x + paddle.w &&
    ball.y + ball.h > paddle.y &&
    ball.y < paddle.y + paddle.h
  ) {
    bounceOffPaddle(state, ball);
  }

  // Un ladrillo por subpaso como máximo, igual que la referencia.
  let broke = false;
  for (const brick of state.bricks) {
    if (!brick.alive) continue;
    if (
      ball.x + ball.w <= brick.x ||
      ball.x >= brick.x + brick.w ||
      ball.y + ball.h <= brick.y ||
      ball.y >= brick.y + brick.h
    )
      continue;

    // Se invierte la componente del eje con menos solapamiento: la referencia
    // invertía siempre la vertical, lo que hace que la bola atraviese de lado
    // una fila entera.
    const overlapX = Math.min(
      ball.x + ball.w - brick.x,
      brick.x + brick.w - ball.x,
    );
    const overlapY = Math.min(
      ball.y + ball.h - brick.y,
      brick.y + brick.h - ball.y,
    );

    if (overlapX < overlapY) {
      if (ball.vx > 0) ball.x = brick.x - ball.w;
      else ball.x = brick.x + brick.w;
      ball.vx = -ball.vx;
    } else {
      if (ball.vy > 0) ball.y = brick.y - ball.h;
      else ball.y = brick.y + brick.h;
      ball.vy = -ball.vy;
    }

    brick.alive = false;
    state.bursts.push({
      x: brick.x,
      y: brick.y,
      w: brick.w,
      h: brick.h,
      type: brick.type,
      elapsed: 0,
    });
    state.score += 10 * state.level;
    maybeDropFrom(state, brick);
    broke = true;
    break;
  }

  return broke;
}

/** Avanza `dt` segundos. Muta el estado in situ. */
export function step(state: ArkanoidState, dt: number): void {
  if (state.over) return;

  // Volver de una pestaña en segundo plano no debe disparar cien subpasos.
  const delta = clamp(dt, 0, 0.05);

  for (const burst of state.bursts) burst.elapsed += delta * 1000;
  state.bursts = state.bursts.filter((b) => b.elapsed < BURST_MS);

  // Los premios caen fuera del bucle de subpasos: no colisionan con nada.
  advanceDrops(state, delta);

  if (state.balls.every((b) => b.serving)) return;

  // Todas las bolas comparten siempre el mismo módulo de velocidad —el del
  // nivel—, así que los subpasos se calculan una sola vez para todas.
  const v = ballSpeed(state.level);
  const steps = Math.max(1, Math.ceil((v * delta) / MAX_STEP_PX));
  const sub = delta / steps;

  for (let i = 0; i < steps; i++) {
    let broke = false;
    for (const ball of state.balls) {
      if (ball.serving) continue;
      if (advanceBall(state, ball, sub)) broke = true;
    }

    // Bolas caídas del fondo en este subpaso: se resuelven después de mover
    // todas, nunca a mitad del recorrido de las demás.
    const fallen = state.balls.filter((b) => !b.serving && b.y > HEIGHT);
    for (const ball of fallen) {
      loseBall(state, ball);
      if (state.over) return;
    }

    // El muro se comprueba antes de salir: romper el último ladrillo y perder
    // la bola en el mismo subpaso no puede dejar el nivel sin pasar.
    if (broke && !state.bricks.some((b) => b.alive)) {
      clearLevel(state);
      return;
    }
    if (state.balls.every((b) => b.serving)) return;
  }
}
