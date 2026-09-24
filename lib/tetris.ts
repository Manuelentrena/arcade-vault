/**
 * Motor de TETRIX. Módulo puro: sin `document`, sin `window`, sin canvas.
 *
 * Portado de `references/started-games/03-tetris/game.js` con dos cambios de
 * regla, decididos en la SPEC 13: una sola vida (el top-out termina la partida)
 * y techo de nivel en 10.
 *
 * El estado se muta in situ a propósito: el componente lo guarda en un `useRef`
 * y pinta en un canvas, así que un objeto nuevo por fotograma no aportaría nada.
 */

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

/** Puntos por 1, 2, 3 o 4 líneas, multiplicados por el nivel. */
const LINE_SCORES = [0, 100, 300, 500, 800];

/**
 * Los siete tetrominós estándar. El índice del array es también el valor que se
 * guarda en el tablero y el que elige el color (`--piece-*` en globals.css).
 */
const PIECES: Shape[] = [
  [],
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ], // I
  [
    [2, 2],
    [2, 2],
  ], // O
  [
    [0, 3, 0],
    [3, 3, 3],
    [0, 0, 0],
  ], // T
  [
    [0, 4, 4],
    [4, 4, 0],
    [0, 0, 0],
  ], // S
  [
    [5, 5, 0],
    [0, 5, 5],
    [0, 0, 0],
  ], // Z
  [
    [6, 0, 0],
    [6, 6, 6],
    [0, 0, 0],
  ], // J
  [
    [0, 0, 7],
    [7, 7, 7],
    [0, 0, 0],
  ], // L
];

export const PIECE_COUNT = PIECES.length - 1;

function createBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => new Array<Cell>(COLS).fill(0));
}

export function randomPiece(): Piece {
  const type = 1 + Math.floor(Math.random() * PIECE_COUNT);
  const shape = PIECES[type].map((row) => [...row]);
  return {
    type,
    shape,
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0,
  };
}

export function collide(
  board: Cell[][],
  shape: Shape,
  ox: number,
  oy: number,
): boolean {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

/** Transposición más inversión de filas: giro de 90° en sentido horario. */
export function rotateCW(shape: Shape): Shape {
  const rows = shape.length;
  const cols = shape[0].length;
  const result: Shape = Array.from({ length: cols }, () =>
    new Array<number>(rows).fill(0),
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      result[c][rows - 1 - r] = shape[r][c];
    }
  }
  return result;
}

/** Nivel a partir de las líneas limpiadas, con el techo de MAX_LEVEL. */
export function levelFor(lines: number): number {
  return Math.min(MAX_LEVEL, Math.floor(lines / 10) + 1);
}

/**
 * Milisegundos entre caídas automáticas. Con el nivel tope en 10 el mínimo real
 * es 190 ms: el `max(100, …)` es el suelo de la fórmula de la referencia y ya no
 * se alcanza, pero se conserva porque documenta ese suelo.
 */
export function dropIntervalMs(level: number): number {
  return Math.max(100, 1000 - (level - 1) * 90);
}

/** Fila en la que aterrizaría la pieza actual: la pieza fantasma. */
export function ghostY(state: TetrisState): number {
  let gy = state.current.y;
  while (!collide(state.board, state.current.shape, state.current.x, gy + 1)) {
    gy++;
  }
  return gy;
}

export function createState(): TetrisState {
  const next = randomPiece();
  const state: TetrisState = {
    board: createBoard(),
    current: next,
    next: randomPiece(),
    score: 0,
    lines: 0,
    level: 1,
    lives: LIVES,
    over: false,
  };
  return state;
}

function merge(state: TetrisState): void {
  const { current, board } = state;
  for (let r = 0; r < current.shape.length; r++) {
    for (let c = 0; c < current.shape[r].length; c++) {
      const value = current.shape[r][c];
      if (value) board[current.y + r][current.x + c] = value as Cell;
    }
  }
}

function clearLines(state: TetrisState): void {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (state.board[r].every((v) => v !== 0)) {
      state.board.splice(r, 1);
      state.board.unshift(new Array<Cell>(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (!cleared) return;
  // El multiplicador es el nivel con el que se jugó la línea, como la referencia.
  state.score += (LINE_SCORES[cleared] ?? 0) * state.level;
  state.lines += cleared;
  state.level = levelFor(state.lines);
}

/**
 * Entra la pieza siguiente. Si ya colisiona al aparecer es el top-out y, con una
 * sola vida, el fin de la partida: el tablero no se limpia ni se continúa.
 */
function spawn(state: TetrisState): void {
  state.current = state.next;
  state.next = randomPiece();
  if (
    collide(state.board, state.current.shape, state.current.x, state.current.y)
  ) {
    state.lives = Math.max(0, state.lives - 1);
    state.over = state.lives === 0;
  }
}

function lockPiece(state: TetrisState): void {
  merge(state);
  clearLines(state);
  spawn(state);
}

export function move(state: TetrisState, dx: -1 | 1): void {
  if (state.over) return;
  if (
    !collide(
      state.board,
      state.current.shape,
      state.current.x + dx,
      state.current.y,
    )
  ) {
    state.current.x += dx;
  }
}

/** Giro horario con los wall kicks de la referencia: 0, ±1, ±2 columnas. */
export function rotate(state: TetrisState): void {
  if (state.over) return;
  const rotated = rotateCW(state.current.shape);
  for (const kick of [0, -1, 1, -2, 2]) {
    if (
      !collide(state.board, rotated, state.current.x + kick, state.current.y)
    ) {
      state.current.shape = rotated;
      state.current.x += kick;
      return;
    }
  }
}

export function softDrop(state: TetrisState): void {
  if (state.over) return;
  if (
    !collide(
      state.board,
      state.current.shape,
      state.current.x,
      state.current.y + 1,
    )
  ) {
    state.current.y++;
    state.score += 1;
  } else {
    lockPiece(state);
  }
}

export function hardDrop(state: TetrisState): void {
  if (state.over) return;
  const gy = ghostY(state);
  state.score += (gy - state.current.y) * 2;
  state.current.y = gy;
  lockPiece(state);
}

/** Un paso del reloj de caída: baja una fila o fija la pieza. */
export function tick(state: TetrisState): void {
  if (state.over) return;
  if (
    !collide(
      state.board,
      state.current.shape,
      state.current.x,
      state.current.y + 1,
    )
  ) {
    state.current.y++;
  } else {
    lockPiece(state);
  }
}
