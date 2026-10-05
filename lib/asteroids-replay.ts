/**
 * Replay en servidor de ASTEROIDES (SPEC 35). Módulo puro: reconstruye el
 * estado del motor (`lib/asteroids.ts`) a partir del registro de pulsaciones
 * y sueltas de las cuatro banderas mantenidas (`left`, `right`, `thrust`,
 * `fire`) y la semilla emitida por `start_game_session`, integrando `step()`
 * a un paso fijo pequeño (`FIXED_DT`) entre un instante logueado y el
 * siguiente — a diferencia de TETRIX/SERPIENTE, que avanzan por un
 * acumulador de ticks discretos, ASTEROIDES tiene física continua y no hay
 * "intervalo" que drenar, solo tiempo real que integrar. El tiempo entre un
 * `pause` y el `resume` que lo sigue no cuenta para la física, y ningún
 * cambio de bandera aplica mientras la partida está en pausa — mismo guard
 * que usa `setFlag()` en el cliente. Al pausar, el cliente limpia las cuatro
 * banderas sin loguear un `*_up` por cada una (`inputRef.current =
 * idleInput()`); el replay hace lo mismo al encontrar un `pause`, así que
 * ninguna bandera queda mantenida de una pulsación anterior a través de la
 * pausa.
 *
 * No valida tamaño ni duración del log: ese tope es responsabilidad de quien
 * llama (la ruta de validación), para que este módulo siga siendo puro y
 * testeable sin red. Sí se protege de no terminar nunca: tras la última
 * entrada, sigue integrando con las banderas que queden mantenidas —igual
 * que el bucle del cliente, que no se detiene al dejar de pulsar nada— pero
 * solo hasta el mismo tope de 45 minutos que ya aplica la ruta de validación
 * al log completo, nunca más allá.
 */

import { createState, step, type Input } from "@/lib/asteroids";
import { FIXED_DT, createSeededRng } from "@/lib/replay-rng";

export type AsteroidsActionType =
  | "left_down"
  | "left_up"
  | "right_down"
  | "right_up"
  | "thrust_down"
  | "thrust_up"
  | "fire_down"
  | "fire_up"
  | "pause"
  | "resume";

export type AsteroidsLogEntry = {
  type: AsteroidsActionType;
  /** Milisegundos desde el inicio de la partida (reloj del propio cliente, monotónico). */
  t: number;
};

export type AsteroidsActionLog = AsteroidsLogEntry[];

export type ReplayResult = {
  score: number;
  level: number;
  over: boolean;
};

const FIXED_DT_MS = FIXED_DT * 1000;

/** Mismo tope que `app/api/validar-partida-asteroides/route.ts`: ninguna partida simula más de esto. */
const MAX_DURATION_MS = 45 * 60 * 1000;

const idleInput = (): Input => ({
  left: false,
  right: false,
  thrust: false,
  fire: false,
});

/** Qué bandera y a qué valor mueve cada tipo de entrada; `pause`/`resume` no mueven ninguna. */
const FLAG_CHANGES: Record<
  AsteroidsActionType,
  { flag: keyof Input; value: boolean } | null
> = {
  left_down: { flag: "left", value: true },
  left_up: { flag: "left", value: false },
  right_down: { flag: "right", value: true },
  right_up: { flag: "right", value: false },
  thrust_down: { flag: "thrust", value: true },
  thrust_up: { flag: "thrust", value: false },
  fire_down: { flag: "fire", value: true },
  fire_up: { flag: "fire", value: false },
  pause: null,
  resume: null,
};

export function replayAsteroides(
  log: AsteroidsActionLog,
  seed: string,
  lives: number,
): ReplayResult {
  const state = createState(lives, createSeededRng(seed));
  const input = idleInput();

  const entries = [...log].sort((a, b) => a.t - b.t);

  // Tiempo de juego ya reproducido, sin contar lo que dura una pausa.
  let simTime = 0;
  let paused = false;

  /** Integra en pasos de FIXED_DT desde `simTime` hasta `targetTime`. */
  const advanceTo = (targetTime: number) => {
    let remaining = targetTime - simTime;
    while (remaining > 0 && !state.over) {
      const dtMs = Math.min(FIXED_DT_MS, remaining);
      step(state, input, dtMs / 1000);
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
      Object.assign(input, idleInput());
      continue;
    }
    if (entry.type === "resume") {
      paused = false;
      continue;
    }
    // Mismo guard que `setFlag()` en el cliente: ningún cambio de bandera
    // aplica mientras la partida está en pausa.
    if (paused) continue;

    const change = FLAG_CHANGES[entry.type];
    if (change) input[change.flag] = change.value;
  }

  // Tras la última entrada, el jugador puede seguir sin tocar nada —el
  // choque que de verdad termina la partida casi nunca coincide con un
  // cambio de bandera— así que sigue integrando con lo que quede mantenido
  // hasta que la partida termine o se agote el mismo tope de 45 minutos que
  // ya aplica la ruta de validación.
  if (!state.over && !paused) advanceTo(MAX_DURATION_MS);

  return { score: state.score, level: state.level, over: state.over };
}
