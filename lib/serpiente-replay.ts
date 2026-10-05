/**
 * Replay en servidor de SERPIENTE (SPEC 33). Módulo puro: reconstruye el
 * estado del motor (`lib/serpiente.ts`) a partir del registro de giros del
 * jugador y la semilla emitida por `start_game_session`, derivando el paso
 * de la rejilla del tiempo real transcurrido entre giros — el mismo
 * acumulador que ya reproduce `lib/tetris-replay.ts` para la gravedad,
 * cambiando `dropIntervalMs(level)` por `tickMs(level)`. El tiempo entre un
 * `pause` y el `resume` que lo sigue no cuenta para el paso, y ningún giro
 * aplica mientras la partida está en pausa — el mismo guard que usa `turn()`
 * en el cliente.
 *
 * No valida tamaño ni duración del log: ese tope es responsabilidad de
 * quien llama (la ruta de validación), para que este módulo siga siendo
 * puro y testeable sin red.
 *
 * El choque casi nunca coincide con un giro del jugador — lo normal es que
 * la serpiente siga recta y se estrelle varios pasos después del último
 * giro logueado, sin ninguna acción que lleve ese instante al registro. Sin
 * una marca para ese momento, el bucle de abajo nunca drena los pasos que
 * de verdad matan: se detiene en el último giro con la partida todavía
 * `over: false`, y la ruta de validación rechaza una partida que sí había
 * terminado. `"over"` es esa marca: `components/serpiente-game.tsx` la
 * loguea en el mismo fotograma en que detecta el choque, con el tiempo de
 * juego ya acumulado hasta ese instante — el mismo acumulador que ya usa
 * para los giros, así que el bucle de abajo no necesita ningún caso
 * especial para ella.
 */

import {
  DIRS,
  createState,
  enqueueDir,
  enqueueTurn,
  step,
  tickMs,
} from "@/lib/serpiente";
import { createSeededRng } from "@/lib/replay-rng";

export type SerpienteActionType =
  | "dir_up"
  | "dir_down"
  | "dir_left"
  | "dir_right"
  | "turn_left"
  | "turn_right"
  | "pause"
  | "resume"
  | "over";

export type SerpienteLogEntry = {
  type: SerpienteActionType;
  /** Milisegundos desde el inicio de la partida (reloj del propio cliente, monotónico). */
  t: number;
};

export type SerpienteActionLog = SerpienteLogEntry[];

export type ReplayResult = {
  score: number;
  level: number;
  over: boolean;
};

export function replaySerpiente(
  log: SerpienteActionLog,
  seed: string,
  lives: number,
): ReplayResult {
  const state = createState(lives, createSeededRng(seed));

  const entries = [...log].sort((a, b) => a.t - b.t);

  let lastT = 0;
  let accum = 0;
  let paused = false;

  for (const entry of entries) {
    if (state.over) break;

    accum += !paused ? entry.t - lastT : 0;
    lastT = entry.t;

    let interval = tickMs(state.level);
    while (!paused && accum >= interval && !state.over) {
      accum -= interval;
      step(state);
      interval = tickMs(state.level);
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
    // Mismo guard que `turn()` en el cliente: ningún giro aplica mientras
    // la partida está en pausa.
    if (paused) continue;

    switch (entry.type) {
      case "dir_up":
        enqueueDir(state, DIRS.up);
        break;
      case "dir_down":
        enqueueDir(state, DIRS.down);
        break;
      case "dir_left":
        enqueueDir(state, DIRS.left);
        break;
      case "dir_right":
        enqueueDir(state, DIRS.right);
        break;
      case "turn_left":
        enqueueTurn(state, -1);
        break;
      case "turn_right":
        enqueueTurn(state, 1);
        break;
    }
  }

  return { score: state.score, level: state.level, over: state.over };
}
