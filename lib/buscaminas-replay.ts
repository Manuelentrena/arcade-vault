/**
 * Replay en servidor de BUSCAMINAS (SPEC 34). Módulo puro: reconstruye el
 * estado del motor (`lib/buscaminas.ts`) a partir del registro de celdas
 * reveladas/marcadas por el jugador y la semilla emitida por
 * `start_game_session`.
 *
 * A diferencia de `lib/tetris-replay.ts`/`lib/serpiente-replay.ts`, no hay
 * ningún acumulador de tiempo que integrar: BUSCAMINAS no tiene gravedad ni
 * ningún `tick()` por tiempo, así que `reveal()`/`toggleFlag()` se reproducen
 * una tras otra en cuanto les toca el turno. `t` solo sirve para ordenar el
 * log cronológicamente antes de reproducirlo, por si llega desordenado.
 *
 * `reveal()`/`toggleFlag()` solo leen la celda bajo `state.cursor` en el
 * instante en que se llaman, nunca el camino que siguió el cursor para
 * llegar ahí — por eso el log no necesita loguear movimientos de cursor
 * (flechas, posiciones del ratón): basta con `setCursor()` a la celda
 * exacta que guardó el cliente antes de llamar a la función del motor.
 *
 * No valida tamaño ni duración del log: ese tope es responsabilidad de
 * quien llama (la ruta de validación), para que este módulo siga siendo
 * puro y testeable sin red.
 */

import { createState, reveal, setCursor, toggleFlag } from "@/lib/buscaminas";
import { createSeededRng } from "@/lib/replay-rng";

export type BuscaminasActionType = "reveal" | "flag";

export type BuscaminasLogEntry = {
  type: BuscaminasActionType;
  row: number;
  col: number;
  /** Milisegundos desde el inicio de la partida (reloj del propio cliente, monotónico). */
  t: number;
};

export type BuscaminasActionLog = BuscaminasLogEntry[];

export type ReplayResult = {
  score: number;
  level: number;
  over: boolean;
};

export function replayBuscaminas(
  log: BuscaminasActionLog,
  seed: string,
  lives: number,
): ReplayResult {
  const state = createState(lives, createSeededRng(seed));

  const entries = [...log].sort((a, b) => a.t - b.t);

  for (const entry of entries) {
    if (state.over) break;
    setCursor(state, entry.row, entry.col);
    if (entry.type === "reveal") {
      reveal(state);
    } else {
      toggleFlag(state);
    }
  }

  return { score: state.score, level: state.level, over: state.over };
}
