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
 *
 * El top-out casi nunca coincide con una acción del jugador: la pieza
 * encaja por gravedad, no por un `hard_drop`, y entonces no hay ninguna
 * acción que lleve ese instante al registro. Sin una marca para ese
 * momento, el bucle de abajo nunca drena la caída que de verdad termina la
 * partida: se detiene en la última acción con `over: false`, y la ruta de
 * validación rechaza una partida que sí había terminado. `"over"` es esa
 * marca: `components/tetris-game.tsx` la loguea en el mismo fotograma en
 * que su bucle de gravedad detecta el top-out (no en `act()`, que ya
 * queda bien con la propia acción que lo causa), con el tiempo real ya
 * transcurrido hasta ese instante.
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
import { createSeededRng } from "@/lib/replay-rng";
export { createSeededRng } from "@/lib/replay-rng";

export type TetrixActionType =
  | "move_left"
  | "move_right"
  | "rotate"
  | "soft_drop"
  | "hard_drop"
  | "pause"
  | "resume"
  | "over";

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
