/**
 * Motor de SERPIENTE. Módulo puro: sin `document`, sin `window`, sin canvas.
 *
 * Portado de `references/started-games/06-serpiente/` con un solo cambio de
 * número, decidido en la SPEC 25: la rejilla baja de 24 × 18 a 20 × 15, porque
 * dentro del tubo de un móvil de 390 px la celda de 24 columnas se queda fina
 * y a 20 mide 17 px (medido: banda de 339 px de ancho). Y un campo nuevo que la
 * referencia no necesita, `started`, porque allí ya estás jugando y aquí se
 * carga una página. Todo lo demás —la cola de giros, la curva de paso, la cola
 * que se libera, la fruta elegida de la lista de celdas libres— es la
 * referencia tal cual.
 *
 * El estado se muta in situ a propósito: el componente lo guarda en un `useRef`
 * y pinta en un canvas, así que un objeto nuevo por fotograma no aportaría nada.
 */

export const COLS = 20;
export const ROWS = 15;
export const CELL = 24;
export const WIDTH = COLS * CELL; // 480
export const HEIGHT = ROWS * CELL; // 360

/** Segmentos con los que arranca la serpiente, centrada y mirando a la derecha. */
export const START_LENGTH = 4;

export const SCORE_PER_FRUIT = 10;
export const FRUITS_PER_LEVEL = 5;

/**
 * Paso del nivel 1 en ms; se recorta TICK_STEP por nivel hasta TICK_MIN. Ese
 * suelo es el tope real de dificultad —el nivel no tiene techo, el mecanismo
 * sí—, igual que MINE_CAP en BUSCAMINAS o la curva de la bola en ARKANOID.
 */
export const TICK_BASE = 150;
export const TICK_STEP = 12;
export const TICK_MIN = 60;

/**
 * Giros encolados. Más de dos deja de ser intención del jugador y se vuelve
 * inercia: pulsas y la serpiente ejecuta un rumbo que ya no querías.
 */
export const QUEUE_MAX = 2;

export type Point = { x: number; y: number };

/** Vector unitario de rumbo; solo existen los cuatro de DIRS. */
export type Dir = Point;

export const DIRS: Record<"up" | "down" | "left" | "right", Dir> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Los cuatro rumbos en sentido horario. `enqueueTurn` indexa aquí: girar a la
 * derecha es avanzar uno en este orden, a la izquierda retroceder uno.
 */
const CLOCKWISE: Dir[] = [DIRS.up, DIRS.right, DIRS.down, DIRS.left];

export type SerpienteState = {
  /** Cabeza en el índice 0. Nunca vacía. */
  snake: Point[];
  /** Rumbo aplicado en el último paso. */
  dir: Dir;
  /** Giros pendientes; step() consume exactamente uno. */
  dirQueue: Dir[];
  fruit: Point;
  /**
   * false hasta la primera entrada de dirección del jugador: hasta entonces
   * `step()` no avanza. Mismo papel que el `serving` de `lib/arkanoid.ts` —la
   * bola espera pegada a la pala—, y por el mismo motivo: con la serpiente
   * arrancando en el centro quedan nueve celdas de pista, así que cargar la
   * página consumía una partida en 1,35 s sin que el jugador tocara nada.
   * Una vez arrancada no se detiene nunca más, que es el género.
   */
  started: boolean;
  score: number;
  /** Frutas comidas en toda la partida; de aquí se deriva el nivel. */
  fruits: number;
  lives: number;
  level: number;
  /** true tras chocar: el reproductor abre el panel de fin. */
  over: boolean;
  /**
   * Generador de aleatoriedad para `placeFruit()` (SPEC 33). Detalle interno
   * de la reproducibilidad: no viaja en ningún tipo que vea el componente
   * fuera de pasarlo a `createState`.
   */
  rng: () => number;
};

/** Paso del nivel dado, en ms. Clavado en TICK_MIN desde el nivel 9. */
export function tickMs(level: number): number {
  return Math.max(TICK_MIN, TICK_BASE - (level - 1) * TICK_STEP);
}

/**
 * El nivel se deriva de las frutas, no se guarda aparte: un campo propio
 * podría desincronizarse de `fruits`, y derivado no puede.
 */
function levelFor(fruits: number): number {
  return 1 + Math.floor(fruits / FRUITS_PER_LEVEL);
}

function occupied(snake: Point[], x: number, y: number): boolean {
  return snake.some((s) => s.x === x && s.y === y);
}

/**
 * Coloca la fruta en una celda libre, elegida de la **lista** de libres y no
 * por muestreo con rechazo: con la serpiente ocupando buena parte de la rejilla
 * el rechazo degenera, y recorrer 300 celdas no.
 */
function placeFruit(state: SerpienteState): void {
  const free: Point[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!occupied(state.snake, x, y)) free.push({ x, y });
    }
  }
  // La rejilla es mucho mayor que la serpiente más larga alcanzable, así que
  // `free` no se vacía en la práctica; la guarda evita un undefined si lo hace.
  if (free.length === 0) return;
  state.fruit = free[Math.floor(state.rng() * free.length)];
}

export function createState(
  lives: number,
  rng: () => number = Math.random,
): SerpienteState {
  const cy = Math.floor(ROWS / 2);
  const cx = Math.floor(COLS / 2);

  const snake: Point[] = [];
  for (let i = 0; i < START_LENGTH; i++) snake.push({ x: cx - i, y: cy });

  const state: SerpienteState = {
    snake,
    dir: DIRS.right,
    dirQueue: [],
    fruit: { x: 0, y: 0 },
    started: false,
    score: 0,
    fruits: 0,
    lives,
    level: 1,
    over: false,
    rng,
  };
  placeFruit(state);
  return state;
}

/**
 * Arranca la partida. Cualquiera de las cuatro direcciones la arranca, incluso
 * una que la cola vaya a descartar después por repetida o por ser marcha atrás:
 * arrancar y girar son dos cosas distintas, y el jugador que pulsa → al
 * principio —el rumbo que ya lleva— está pidiendo salir, no girar.
 */
export function start(state: SerpienteState): void {
  if (state.over) return;
  state.started = true;
}

/** El rumbo contra el que se valida un giro nuevo: el último encolado, o `dir`. */
function pendingDir(state: SerpienteState): Dir {
  return state.dirQueue.length > 0
    ? state.dirQueue[state.dirQueue.length - 1]
    : state.dir;
}

/**
 * Encola un giro. Se descarta si invierte —o repite— el rumbo pendiente.
 *
 * Validar contra el **último de la cola** y no contra `state.dir` es la razón
 * de ser de la cola: con una sola ranura, dos giros dentro del mismo paso se
 * validan los dos contra un `dir` que todavía no ha avanzado, así que
 * «derecha y luego arriba» en el mismo instante puede resolverse en una
 * inversión y la serpiente se come el cuello. Es el bug clásico del género y
 * es invisible hasta que un jugador rápido lo encuentra.
 */
export function enqueueDir(state: SerpienteState, dir: Dir): void {
  if (state.over) return;
  start(state);
  if (state.dirQueue.length >= QUEUE_MAX) return;

  const last = pendingDir(state);
  if (dir.x === -last.x && dir.y === -last.y) return; // marcha atrás
  if (dir.x === last.x && dir.y === last.y) return; // no es un giro

  state.dirQueue.push(dir);
}

/**
 * Encola un giro de 90° **relativo** al rumbo pendiente: `-1` a la izquierda,
 * `+1` a la derecha. Es lo que pulsan los botones A y B del mando (SPEC 21), y
 * acaba en el mismo `dirQueue` con las mismas reglas — no es una segunda vía de
 * estado, solo otra forma de calcular qué dirección encolar.
 */
export function enqueueTurn(state: SerpienteState, turn: -1 | 1): void {
  if (state.over) return;
  start(state);

  const last = pendingDir(state);
  const i = CLOCKWISE.findIndex((d) => d.x === last.x && d.y === last.y);
  if (i === -1) return;

  enqueueDir(
    state,
    CLOCKWISE[(i + turn + CLOCKWISE.length) % CLOCKWISE.length],
  );
}

/**
 * Un paso. Consume un giro de la cola, avanza la cabeza, resuelve la colisión y
 * come o suelta la cola.
 */
export function step(state: SerpienteState): void {
  if (state.over || !state.started) return;

  if (state.dirQueue.length > 0) {
    state.dir = state.dirQueue.shift() as Dir;
  }

  const head = state.snake[0];
  const next: Point = { x: head.x + state.dir.x, y: head.y + state.dir.y };

  // El muro mata: no hay bordes que envuelvan.
  if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) {
    state.lives = 0;
    state.over = true;
    return;
  }

  const willEat = next.x === state.fruit.x && next.y === state.fruit.y;

  // Si no come, el último segmento abandona su celda en este mismo paso, así
  // que no cuenta como choque: seguirse la cola a distancia cero es la
  // maniobra buena, y matar al jugador por hacerla sería el defecto.
  const tail = willEat ? state.snake.length : state.snake.length - 1;
  for (let i = 0; i < tail; i++) {
    if (state.snake[i].x === next.x && state.snake[i].y === next.y) {
      state.lives = 0;
      state.over = true;
      return;
    }
  }

  state.snake.unshift(next);

  if (willEat) {
    state.fruits++;
    state.score += SCORE_PER_FRUIT * state.level;
    state.level = levelFor(state.fruits);
    placeFruit(state);
  } else {
    state.snake.pop();
  }
}
