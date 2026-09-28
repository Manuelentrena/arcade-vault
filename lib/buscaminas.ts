/**
 * Motor de BUSCAMINAS. Módulo puro: sin `document`, sin `window`, sin canvas.
 *
 * Portado de `references/started-games/05-buscaminas/` con dos cambios de
 * diseño, decididos en la SPEC 20: una vida (coincide con la propia
 * referencia) y una progresión de nivel nueva —cada rejilla despejada sube el
 * nivel y añade una mina— que la referencia no tiene. La colocación de minas,
 * el flood-fill y las banderas son idénticos a la referencia; solo la
 * cantidad de minas pasa de una constante fija a `minesForLevel(level)`.
 *
 * El estado se muta in situ a propósito: el componente lo guarda en un
 * `useRef` y pinta en un canvas, así que un objeto nuevo por fotograma no
 * aportaría nada.
 */

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

const SCORE_PER_CELL = 10;

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
export function minesForLevel(level: number): number {
  return Math.min(MINE_CAP, BASE_MINES - 1 + level);
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

function neighbors(row: number, col: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (inBounds(row + dr, col + dc)) out.push([row + dr, col + dc]);
    }
  }
  return out;
}

function makeBoard(): Cell[][] {
  const board: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) {
      row.push({ mine: false, revealed: false, flagged: false, adjacent: 0 });
    }
    board.push(row);
  }
  return board;
}

function freshGrid(state: BuscaminasState): void {
  state.board = makeBoard();
  state.cursor = { row: 6, col: 8 };
  state.mines = minesForLevel(state.level);
  state.flags = 0;
  state.revealedCount = 0;
  state.firstReveal = true;
}

export function createState(lives: number): BuscaminasState {
  const state: BuscaminasState = {
    board: makeBoard(),
    cursor: { row: 6, col: 8 },
    mines: minesForLevel(1),
    flags: 0,
    revealedCount: 0,
    firstReveal: true,
    score: 0,
    lives,
    level: 1,
    over: false,
  };
  return state;
}

/** Mueve el cursor dx/dy, saturado a los bordes de la rejilla. Sin efecto si over. */
export function moveCursor(
  state: BuscaminasState,
  dx: -1 | 0 | 1,
  dy: -1 | 0 | 1,
): void {
  if (state.over) return;
  state.cursor.row = Math.min(ROWS - 1, Math.max(0, state.cursor.row + dy));
  state.cursor.col = Math.min(COLS - 1, Math.max(0, state.cursor.col + dx));
}

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
): void {
  if (state.over) return;
  state.cursor.row = Math.min(ROWS - 1, Math.max(0, row));
  state.cursor.col = Math.min(COLS - 1, Math.max(0, col));
}

function placeMines(
  state: BuscaminasState,
  safeRow: number,
  safeCol: number,
): void {
  const safe = new Set(
    neighbors(safeRow, safeCol).map(([r, c]) => `${r},${c}`),
  );
  safe.add(`${safeRow},${safeCol}`);

  let placed = 0;
  while (placed < state.mines) {
    const r = Math.floor(Math.random() * ROWS);
    const c = Math.floor(Math.random() * COLS);
    if (safe.has(`${r},${c}`)) continue;
    if (state.board[r][c].mine) continue;
    state.board[r][c].mine = true;
    placed++;
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.board[r][c].mine) continue;
      state.board[r][c].adjacent = neighbors(r, c).filter(
        ([nr, nc]) => state.board[nr][nc].mine,
      ).length;
    }
  }
}

function revealFlood(
  state: BuscaminasState,
  startRow: number,
  startCol: number,
): number {
  const before = state.revealedCount;
  const stack: [number, number][] = [[startRow, startCol]];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    const cell = state.board[r][c];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    state.revealedCount++;
    if (cell.adjacent === 0) {
      for (const [nr, nc] of neighbors(r, c)) {
        if (!state.board[nr][nc].revealed && !state.board[nr][nc].mine) {
          stack.push([nr, nc]);
        }
      }
    }
  }
  return state.revealedCount - before;
}

function revealAllMines(state: BuscaminasState): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.board[r][c].mine) state.board[r][c].revealed = true;
    }
  }
}

/**
 * Revela la celda bajo el cursor. Primer reveal de cada rejilla: coloca las
 * minas excluyendo la celda y sus 8 vecinas. Mina → lives = 0, over = true.
 * Celda segura → flood-fill y `score += celdas × 10 × level`. Rejilla vacía
 * de no-minas → sube de nivel: nueva rejilla con más minas, cursor recentrado,
 * banderas y contador a cero; la vida y la puntuación no se tocan.
 */
export function reveal(state: BuscaminasState): void {
  if (state.over) return;
  const { row, col } = state.cursor;
  const cell = state.board[row][col];
  if (cell.revealed || cell.flagged) return;

  if (state.firstReveal) {
    placeMines(state, row, col);
    state.firstReveal = false;
  }

  if (cell.mine) {
    cell.revealed = true;
    revealAllMines(state);
    state.lives = 0;
    state.over = true;
    return;
  }

  const revealed = revealFlood(state, row, col);
  state.score += revealed * SCORE_PER_CELL * state.level;

  if (state.revealedCount === COLS * ROWS - state.mines) {
    state.level++;
    freshGrid(state);
  }
}

/** Alterna la bandera de la celda bajo el cursor. Tope: state.mines banderas. */
export function toggleFlag(state: BuscaminasState): void {
  if (state.over) return;
  const { row, col } = state.cursor;
  const cell = state.board[row][col];
  if (cell.revealed) return;
  if (!cell.flagged && state.flags >= state.mines) return;
  cell.flagged = !cell.flagged;
  state.flags += cell.flagged ? 1 : -1;
}
