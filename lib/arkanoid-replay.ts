/**
 * Replay en servidor de ARKANOID (SPEC 36). Módulo puro: reconstruye el
 * estado del motor (`lib/arkanoid.ts`) a partir del registro de acciones de
 * la partida y la semilla emitida por `start_game_session`, integrando
 * `step()` a paso fijo (`FIXED_DT`, compartido con `lib/asteroids-replay.ts`
 * desde SPEC 35) — mismo criterio que ASTEROIDES: física continua, no un
 * acumulador de ticks discretos.
 *
 * La pala tiene dos vías de control que coexisten sin excluirse: el teclado
 * mantenido (`left_down`/`left_up`/`right_down`/`right_up`, que mueve
 * `movePaddle()` en cada paso de física mientras una sola dirección está
 * mantenida) y el arrastre por puntero (`paddle_x`, que coloca `setPaddleX()`
 * exactamente en el timestamp de cada muestra logueada). Las dos pueden
 * escribir `paddle.x` en la misma partida sin conflicto, en el mismo orden
 * relativo en que el cliente las aplica hoy.
 *
 * Igual que ASTEROIDES: el tiempo entre un `pause` y el `resume` que lo sigue
 * no cuenta para la física, y al pausar se sueltan las dos direcciones
 * mantenidas (mismo guard que `heldRef.current = { left: false, right: false
 * }` en el cliente), así que ninguna dirección queda mantenida de una
 * pulsación anterior a través de la pausa.
 *
 * No valida tamaño ni duración del log — eso es responsabilidad de quien
 * llama (la ruta de validación) — pero sí se protege de no terminar nunca:
 * tras la última entrada sigue integrando con lo que quede mantenido, solo
 * hasta el mismo tope de 45 minutos que ya aplica la ruta de validación.
 */

import {
  createState,
  movePaddle,
  serve,
  setPaddleX,
  step,
} from "@/lib/arkanoid";
import { FIXED_DT, createSeededRng } from "@/lib/replay-rng";

export type ArkanoidActionLog = ArkanoidLogEntry[];

export type ArkanoidLogEntry =
  | {
      type:
        | "left_down"
        | "left_up"
        | "right_down"
        | "right_up"
        | "serve"
        | "pause"
        | "resume";
      /** Milisegundos desde el inicio de la partida (reloj del propio cliente, monotónico). */
      t: number;
    }
  | {
      type: "paddle_x";
      /** Posición lógica (coordenadas del mundo, 0-800) del centro apuntado por el puntero. */
      x: number;
      t: number;
    };

export type ReplayResult = {
  score: number;
  level: number;
  over: boolean;
};

const FIXED_DT_MS = FIXED_DT * 1000;

/** Mismo tope que `app/api/validar-partida-arkanoid/route.ts`: ninguna partida simula más de esto. */
const MAX_DURATION_MS = 45 * 60 * 1000;

export function replayArkanoid(
  log: ArkanoidActionLog,
  seed: string,
  lives: number,
): ReplayResult {
  const state = createState(lives, createSeededRng(seed));
  const held = { left: false, right: false };

  const entries = [...log].sort((a, b) => a.t - b.t);

  // Tiempo de juego ya reproducido, sin contar lo que dura una pausa.
  let simTime = 0;
  let paused = false;

  /** Integra en pasos de FIXED_DT desde `simTime` hasta `targetTime`. */
  const advanceTo = (targetTime: number) => {
    let remaining = targetTime - simTime;
    while (remaining > 0 && !state.over) {
      const dtMs = Math.min(FIXED_DT_MS, remaining);
      const dt = dtMs / 1000;
      if (held.left !== held.right) movePaddle(state, held.left ? -1 : 1, dt);
      step(state, dt);
      remaining -= dtMs;
    }
    simTime = targetTime;
  };

  for (const entry of entries) {
    if (state.over) break;

    if (!paused) advanceTo(entry.t);
    else simTime = entry.t;

    if (state.over) break;

    if (entry.type === "pause") {
      paused = true;
      held.left = false;
      held.right = false;
      continue;
    }
    if (entry.type === "resume") {
      paused = false;
      continue;
    }
    // Mismo guard que el cliente: ningún cambio de entrada aplica en pausa.
    if (paused) continue;

    switch (entry.type) {
      case "left_down":
        held.left = true;
        break;
      case "left_up":
        held.left = false;
        break;
      case "right_down":
        held.right = true;
        break;
      case "right_up":
        held.right = false;
        break;
      case "serve":
        serve(state);
        break;
      case "paddle_x":
        setPaddleX(state, entry.x);
        break;
    }
  }

  // Tras la última entrada, el jugador puede seguir sin tocar nada —la bola
  // cayéndose del fondo casi nunca coincide con un cambio de entrada— así que
  // sigue integrando con lo que quede mantenido hasta que la partida termine
  // o se agote el mismo tope de 45 minutos que ya aplica la ruta de validación.
  if (!state.over && !paused) advanceTo(MAX_DURATION_MS);

  return { score: state.score, level: state.level, over: state.over };
}
