"use client";

import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent,
  type Ref,
} from "react";
import type { PadAction, PadHandle } from "@/components/game-player";
import {
  CELL,
  COLS,
  DIRS,
  HEIGHT,
  ROWS,
  WIDTH,
  createState,
  enqueueDir,
  enqueueTurn,
  step,
  tickMs,
  type SerpienteState,
} from "@/lib/serpiente";
import { createSeededRng } from "@/lib/replay-rng";
import type {
  SerpienteActionLog,
  SerpienteActionType,
} from "@/lib/serpiente-replay";

/**
 * Techo del delta acumulado por fotograma. Sin él, volver de una pestaña en
 * segundo plano drena una ráfaga de pasos que el jugador no vio y lo mata sin
 * haber tocado nada. ARKANOID resuelve lo mismo acotando a 50 ms; aquí el paso
 * es mucho más largo, así que el techo también.
 */
const MAX_DT = 200;

/**
 * Tokens de `:root`; el CSS es la única fuente de verdad de la paleta. Cian y
 * magenta porque son los dos colores del logotipo —`ARCADE` se pinta en cian,
 * `VAULT` en magenta (`components/nav.tsx`), y `game-player.tsx` ya describe
 * `--magenta` como "el mismo con el que el logo escribe VAULT"—, pedido
 * explícito sobre el verde/rojo original de esta spec.
 */
const COLOR_VARS = ["--cyan", "--magenta", "--line"] as const;

/** Respaldo por si algún token desapareciera: un tablero invisible no se juega. */
const COLOR_FALLBACK = [
  "#00f5ff",
  "#ff006e",
  "rgba(0, 245, 255, 0.18)",
] as const;

export type SerpienteRun = { score: number; lives: number; level: number };

/** Mutador del motor junto al tipo de giro que loguea (SPEC 33). */
type ActionEntry = {
  type: SerpienteActionType;
  run: (state: SerpienteState) => void;
};

const ACTIONS = {
  dirUp: { type: "dir_up", run: (s: SerpienteState) => enqueueDir(s, DIRS.up) },
  dirDown: {
    type: "dir_down",
    run: (s: SerpienteState) => enqueueDir(s, DIRS.down),
  },
  dirLeft: {
    type: "dir_left",
    run: (s: SerpienteState) => enqueueDir(s, DIRS.left),
  },
  dirRight: {
    type: "dir_right",
    run: (s: SerpienteState) => enqueueDir(s, DIRS.right),
  },
  turnLeft: {
    type: "turn_left",
    run: (s: SerpienteState) => enqueueTurn(s, -1),
  },
  turnRight: {
    type: "turn_right",
    run: (s: SerpienteState) => enqueueTurn(s, 1),
  },
} satisfies Record<string, ActionEntry>;

type SerpienteGameProps = {
  /** Lo controla el botón PAUSA del HUD. Con true, el bucle no avanza. */
  paused: boolean;
  /** Alterna la pausa: la tecla P llama aquí, no a un estado propio. */
  onTogglePause: () => void;
  /** El motor empuja aquí score / lives / level cuando cambian. */
  onRun: (run: SerpienteRun) => void;
  /**
   * Choque: el reproductor abre el panel de FIN DEL JUEGO. Lleva el
   * registro de giros de la partida (SPEC 33) para que `game-player.tsx`
   * pueda mandarlo al replay en servidor antes de guardar.
   */
  onOver: (log: SerpienteActionLog) => void;
  /** Vidas iniciales reales (`games.vidas`). */
  initialLives: number;
  /** Ignorado: el nivel de SERPIENTE no tiene techo (`games.niveles` = null). */
  maxLevel: number | null;
  /** Donde se publica el PadHandle que pulsa el mando de móvil (SPEC 21). */
  padRef: Ref<PadHandle>;
  /** Semilla de `start_game_session` (SPEC 33): siembra el mismo generador que usará el replay. */
  seed: string;
};

function SerpienteGameImpl({
  paused,
  onTogglePause,
  onRun,
  onOver,
  initialLives,
  padRef,
  seed,
}: SerpienteGameProps) {
  const boardRef = useRef<HTMLCanvasElement | null>(null);

  // El estado del motor vive en un ref: a 60 fps un setState por fotograma
  // reconciliaría React para pintar en un canvas que React no gestiona.
  const stateRef = useRef<SerpienteState | null>(null);
  if (stateRef.current === null)
    stateRef.current = createState(initialLives, createSeededRng(seed));

  // Historial de la partida: el replay en servidor (SPEC 33) reproduce el
  // paso a partir de estos deltas de tiempo. Se loguea tiempo de JUEGO
  // acumulado (`gameTimeRef`), no reloj de pared — el mismo acumulador
  // recortado por `MAX_DT` que usa el bucle más abajo, para que un frame
  // perdido (pestaña en segundo plano) no cuente de más aquí y de menos
  // allí: ambos deben ver exactamente el mismo tiempo transcurrido.
  const gameTimeRef = useRef(0);
  const logRef = useRef<SerpienteActionLog>([]);
  const prevPausedRef = useRef(paused);

  const colorsRef = useRef<readonly string[]>(COLOR_FALLBACK);
  const lastRunRef = useRef<SerpienteRun | null>(null);

  // Callbacks en refs para que el bucle no se reinicie cuando el padre repinta.
  const onRunRef = useRef(onRun);
  const onOverRef = useRef(onOver);
  const onTogglePauseRef = useRef(onTogglePause);
  useEffect(() => {
    onRunRef.current = onRun;
    onOverRef.current = onOver;
    onTogglePauseRef.current = onTogglePause;
  }, [onRun, onOver, onTogglePause]);

  /** Prepara el canvas al tamaño lógico, escalado por devicePixelRatio. */
  const context2d = useCallback((canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(WIDTH * dpr)) {
      canvas.width = Math.round(WIDTH * dpr);
      canvas.height = Math.round(HEIGHT * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }, []);

  /**
   * Pinta rejilla, fruta y serpiente. Nada más: ni puntuación, ni vidas, ni
   * nivel — regla no negociable de las cuatro specs anteriores.
   */
  const draw = useCallback(() => {
    const canvas = boardRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const ctx = context2d(canvas);
    if (!ctx) return;

    const [cyan, magenta, line] = colorsRef.current;

    // Transparente, no negro: igual que TETRIX, el lienzo deja ver el
    // resplandor de `.snake-stage` que hay detrás. Rellenarlo de negro lo
    // tapaba y el tablero quedaba como una losa plana dentro del tubo.
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Rejilla tenue: sin ella la serpiente flota y el paso discreto no se lee.
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, HEIGHT);
      ctx.stroke();
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(WIDTH, y * CELL + 0.5);
      ctx.stroke();
    }

    // Fruta: el magenta del logo, el mismo con el que escribe VAULT.
    const fx = state.fruit.x * CELL + CELL / 2;
    const fy = state.fruit.y * CELL + CELL / 2;
    ctx.fillStyle = magenta;
    ctx.beginPath();
    ctx.arc(fx, fy, CELL * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Cuerpo, de la cola a la cabeza, en el cian del logo. Se atenúa hacia la
    // cola para leer de un vistazo la propia trayectoria, el peligro real.
    ctx.fillStyle = cyan;
    for (let i = state.snake.length - 1; i > 0; i--) {
      const s = state.snake[i];
      ctx.globalAlpha = 0.35 + (1 - i / state.snake.length) * 0.4;
      ctx.fillRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4);
    }
    ctx.globalAlpha = 1;

    // Cabeza: el mismo cian aclarado con un velo blanco, para no parsear el
    // token —puede venir en cualquier formato— solo para subirle el brillo.
    const head = state.snake[0];
    const hx = head.x * CELL;
    const hy = head.y * CELL;
    ctx.fillStyle = cyan;
    ctx.fillRect(hx + 1, hy + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(hx + 1, hy + 1, CELL - 2, CELL - 2);

    // Ojos orientados al rumbo: dicen hacia dónde va sin leer nada.
    ctx.fillStyle = "#06141a";
    const ox = state.dir.x * CELL * 0.18;
    const oy = state.dir.y * CELL * 0.18;
    const px = state.dir.x === 0 ? CELL * 0.18 : 0;
    const py = state.dir.x === 0 ? 0 : CELL * 0.18;
    const cx = hx + CELL / 2 + ox;
    const cy = hy + CELL / 2 + oy;
    ctx.beginPath();
    ctx.arc(cx - px, cy - py, 2, 0, Math.PI * 2);
    ctx.arc(cx + px, cy + py, 2, 0, Math.PI * 2);
    ctx.fill();
  }, [context2d]);

  /** Avisa al HUD sólo cuando cambia alguno de los tres números. */
  const publish = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    const last = lastRunRef.current;
    if (
      last &&
      last.score === state.score &&
      last.lives === state.lives &&
      last.level === state.level
    ) {
      return;
    }
    const run = {
      score: state.score,
      lives: state.lives,
      level: state.level,
    };
    lastRunRef.current = run;
    onRunRef.current(run);
  }, []);

  // Los colores salen del tema: se leen una vez al montar.
  useEffect(() => {
    const root = getComputedStyle(document.documentElement);
    colorsRef.current = COLOR_VARS.map((name, i) => {
      const value = root.getPropertyValue(name).trim();
      return value || COLOR_FALLBACK[i];
    });
    draw();
    publish();
  }, [draw, publish]);

  /**
   * Aplica un giro del jugador, lo loguea con su timestamp y repinta. Guarda
   * propia de `paused`: el motor ya descarta un giro con la partida
   * terminada, pero no sabe nada de la pausa.
   */
  const turn = useCallback(
    (action: ActionEntry) => {
      const state = stateRef.current;
      if (!state || paused || state.over) return;
      action.run(state);
      logRef.current.push({
        type: action.type,
        t: gameTimeRef.current,
      });
    },
    [paused],
  );

  // Pausa/reanudación entran en el registro igual que cualquier otro giro:
  // el replay en servidor ignora el tiempo entre ambas (SPEC 33). Solo
  // transiciones reales tras montar, nunca el valor inicial.
  useEffect(() => {
    if (prevPausedRef.current === paused) return;
    prevPausedRef.current = paused;
    if (stateRef.current?.over) return;
    logRef.current.push({
      type: paused ? "pause" : "resume",
      t: gameTimeRef.current,
    });
  }, [paused]);

  // Bucle. A diferencia de BUSCAMINAS, aquí el estado avanza solo: el
  // acumulador drena pasos discretos y el intervalo se recalcula dentro del
  // while porque el nivel puede subir en medio de la misma ráfaga.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    draw();
    if (paused || state.over) return;

    let raf = 0;
    let last = performance.now();
    let accum = 0;

    const loop = (ts: number) => {
      const dt = Math.min(ts - last, MAX_DT);
      accum += dt;
      gameTimeRef.current += dt;
      last = ts;
      let interval = tickMs(state.level);
      while (accum >= interval && !state.over) {
        accum -= interval;
        step(state);
        interval = tickMs(state.level);
      }
      draw();
      publish();
      if (state.over) {
        // El choque casi nunca coincide con un giro: sin esta marca, el
        // replay en servidor se queda en el último giro logueado y nunca
        // drena los pasos que de verdad matan.
        logRef.current.push({ type: "over", t: gameTimeRef.current });
        onOverRef.current(logRef.current);
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, paused, publish]);

  // Teclado: las cuatro flechas giran, por flanco y sin repetición. Mantener
  // una pulsada no significa nada —la serpiente ya se mueve sola—, y las
  // repeticiones que el navegador manda al mantener encolan un rumbo que
  // `enqueueDir` descarta por repetido, así que no hace falta filtrarlas.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyP") {
        event.preventDefault();
        onTogglePauseRef.current();
        return;
      }
      const action: ActionEntry | null =
        event.code === "ArrowUp"
          ? ACTIONS.dirUp
          : event.code === "ArrowDown"
            ? ACTIONS.dirDown
            : event.code === "ArrowLeft"
              ? ACTIONS.dirLeft
              : event.code === "ArrowRight"
                ? ACTIONS.dirRight
                : null;
      if (!action) return;
      // preventDefault() antes de cualquier guarda: en pausa las flechas
      // seguirían desplazando la página si no.
      event.preventDefault();
      turn(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [turn]);

  /**
   * El mando de móvil (SPEC 21) entra por el mismo camino que la cruceta de
   * dentro del tubo. Los dos círculos giran 90° **relativo** al rumbo —A a la
   * derecha, B a la izquierda— y acaban en el mismo `dirQueue`, con las mismas
   * reglas: no son una segunda vía de estado.
   *
   * `release` es un no-op a propósito: nada repite mientras se mantiene, así
   * que soltar no significa nada. Es la primera vez que un motor lo deja
   * vacío, y es coherente con la regla de SPEC 21 — el motor recibe
   * `press`/`release` y decide qué significan.
   */
  useImperativeHandle(
    padRef,
    () => ({
      press: (action: PadAction) => {
        switch (action) {
          case "up":
            turn(ACTIONS.dirUp);
            break;
          case "down":
            turn(ACTIONS.dirDown);
            break;
          case "left":
            turn(ACTIONS.dirLeft);
            break;
          case "right":
            turn(ACTIONS.dirRight);
            break;
          case "a":
            turn(ACTIONS.turnRight);
            break;
          case "b":
            turn(ACTIONS.turnLeft);
            break;
          default:
            break;
        }
      },
      release: () => {},
    }),
    [turn],
  );

  const padProps = (action: ActionEntry) => ({
    type: "button" as const,
    className: "btn",
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      turn(action);
    },
  });

  return (
    <>
      {/* Banda de leyenda, dentro del tubo y encima del tablero: la reservan
          todos los juegos por igual. SERPIENTE no tiene nada que explicar ahí
          —ni premios ni contadores—, así que muestra el rótulo vacío, igual
          que TETRIX. Solo se ve a ≤ 720px (SPEC 21). */}
      <div className="screen-legend">
        <span className="screen-legend-empty">LEYENDA</span>
      </div>
      <div className="snake-stage">
        <canvas
          ref={boardRef}
          className="snake-board"
          width={WIDTH}
          height={HEIGHT}
          role="img"
          aria-label="Tablero de SERPIENTE"
        />
        {/* Columna lateral, nunca encima del tablero: la serpiente puede
            estar en cualquier celda, incluida la última fila. */}
        <div className="snake-side">
          <div className="snake-block">
            <span className="l">GIRO</span>
            <div className="snake-pad">
              <button
                {...padProps(ACTIONS.dirUp)}
                className="btn pad-up"
                aria-label="Girar hacia arriba"
              >
                ↑
              </button>
              <button
                {...padProps(ACTIONS.dirLeft)}
                className="btn pad-left"
                aria-label="Girar a la izquierda"
              >
                ←
              </button>
              <button
                {...padProps(ACTIONS.dirDown)}
                className="btn pad-down"
                aria-label="Girar hacia abajo"
              >
                ↓
              </button>
              <button
                {...padProps(ACTIONS.dirRight)}
                className="btn pad-right"
                aria-label="Girar a la derecha"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const SerpienteGame = memo(SerpienteGameImpl);
