/**
 * Replay en servidor de TETRIX (SPEC 32). Módulo puro: reconstruye el
 * estado del motor (`lib/tetris.ts`) a partir del registro de acciones del
 * jugador y la semilla emitida por `start_game_session`, derivando la
 * caída por gravedad del tiempo real transcurrido entre acciones — el
 * mismo acumulador que ya usa el bucle de `requestAnimationFrame` de
 * `components/tetris-game.tsx`, reiniciado en cada reanudación. El tiempo
 * entre un `pause` y el `resume` que lo sigue no cuenta para la gravedad, y
 * ninguna acción de movimiento aplica mientras la partida está en pausa —
 * el mismo guard que usa `act()` en el cliente.
 *
 * No valida tamaño ni duración del log: ese tope es responsabilidad de
 * quien llama (la ruta de validación), para que este módulo siga siendo
 * puro y testeable sin red.
 */

import {
  createState,
  dropIntervalMs,
  hardDrop,
  move,
  rotate,
  softDrop,
  tick,
} from "@/lib/tetris";

export type TetrixActionType =
  | "move_left"
  | "move_right"
  | "rotate"
  | "soft_drop"
  | "hard_drop"
  | "pause"
  | "resume";

export type TetrixLogEntry = {
  type: TetrixActionType;
  /** Milisegundos desde el inicio de la partida (reloj del propio cliente, monotónico). */
  t: number;
};

export type TetrixActionLog = TetrixLogEntry[];

export type ReplayResult = {
  score: number;
  level: number;
  over: boolean;
};

/** mulberry32: PRNG determinista y seedable a partir de un entero de 32 bits. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** La semilla hex de `start_game_session` a un entero de 32 bits para sembrar el PRNG. */
function seedToInt(seed: string): number {
  return parseInt(seed.slice(0, 8), 16) || 0;
}

/**
 * El mismo generador de piezas que usa `replayTetrix()`, exportado para que
 * `components/tetris-game.tsx` lo siembre con la semilla de
 * `start_game_session` y juegue exactamente la secuencia que el servidor
 * reproducirá después — una sola implementación del PRNG, no dos que
 * tendrían que mantenerse de acuerdo.
 */
export function createSeededRng(seed: string): () => number {
  return mulberry32(seedToInt(seed));
}

export function replayTetrix(
  log: TetrixActionLog,
  seed: string,
  lives: number,
  maxLevel: number | null,
): ReplayResult {
  const state = createState(lives, maxLevel, createSeededRng(seed));

  const entries = [...log].sort((a, b) => a.t - b.t);

  let lastT = 0;
  let accum = 0;
  let paused = false;

  for (const entry of entries) {
    if (state.over) break;

    accum += !paused ? entry.t - lastT : 0;
    lastT = entry.t;

    let interval = dropIntervalMs(state.level);
    while (!paused && accum >= interval && !state.over) {
      accum -= interval;
      tick(state);
      interval = dropIntervalMs(state.level);
    }

    if (state.over) break;

    if (entry.type === "pause") {
      paused = true;
      continue;
    }
    if (entry.type === "resume") {
      paused = false;
      accum = 0;
      continue;
    }
    // Mismo guard que `act()` en el cliente: ninguna acción de movimiento
    // aplica mientras la partida está en pausa.
    if (paused) continue;

    switch (entry.type) {
      case "move_left":
        move(state, -1);
        break;
      case "move_right":
        move(state, 1);
        break;
      case "rotate":
        rotate(state);
        break;
      case "soft_drop":
        softDrop(state);
        break;
      case "hard_drop":
        hardDrop(state);
        break;
    }
  }

  return { score: state.score, level: state.level, over: state.over };
}
