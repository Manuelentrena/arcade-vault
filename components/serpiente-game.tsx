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
  type Dir,
  type SerpienteState,
} from "@/lib/serpiente";

/**
 * Techo del delta acumulado por fotograma. Sin él, volver de una pestaña en
 * segundo plano drena una ráfaga de pasos que el jugador no vio y lo mata sin
 * haber tocado nada. ARKANOID resuelve lo mismo acotando a 50 ms; aquí el paso
 * es mucho más largo, así que el techo también.
 */
const MAX_DT = 200;

/** Tokens de `:root`; el CSS es la única fuente de verdad de la paleta. */
const COLOR_VARS = ["--green", "--red", "--line"] as const;

/** Respaldo por si algún token desapareciera: un tablero invisible no se juega. */
const COLOR_FALLBACK = [
  "#00ff88",
  "#ff2f45",
  "rgba(0, 245, 255, 0.18)",
] as const;

export type SerpienteRun = { score: number; lives: number; level: number };

type SerpienteGameProps = {
  /** Lo controla el botón PAUSA del HUD. Con true, el bucle no avanza. */
  paused: boolean;
  /** Alterna la pausa: la tecla P llama aquí, no a un estado propio. */
  onTogglePause: () => void;
  /** El motor empuja aquí score / lives / level cuando cambian. */
  onRun: (run: SerpienteRun) => void;
  /** Choque: el reproductor abre el panel de FIN DEL JUEGO. */
  onOver: () => void;
  /** Vidas iniciales reales (`games.vidas`). */
  initialLives: number;
  /** Ignorado: el nivel de SERPIENTE no tiene techo (`games.niveles` = null). */
  maxLevel: number | null;
  /** Donde se publica el PadHandle que pulsa el mando de móvil (SPEC 21). */
  padRef: Ref<PadHandle>;
};

function SerpienteGameImpl({
  paused,
  onTogglePause,
  onRun,
  onOver,
  initialLives,
  padRef,
}: SerpienteGameProps) {
  const boardRef = useRef<HTMLCanvasElement | null>(null);

  // El estado del motor vive en un ref: a 60 fps un setState por fotograma
  // reconciliaría React para pintar en un canvas que React no gestiona.
  const stateRef = useRef<SerpienteState | null>(null);
  if (stateRef.current === null) stateRef.current = createState(initialLives);

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

    const [green, red, line] = colorsRef.current;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

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

    // Fruta.
    const fx = state.fruit.x * CELL + CELL / 2;
    const fy = state.fruit.y * CELL + CELL / 2;
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.arc(fx, fy, CELL * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Cuerpo, de la cola a la cabeza. Se atenúa hacia la cola para leer de un
    // vistazo la propia trayectoria, que es el peligro real del juego.
    ctx.fillStyle = green;
    for (let i = state.snake.length - 1; i > 0; i--) {
      const s = state.snake[i];
      ctx.globalAlpha = 0.35 + (1 - i / state.snake.length) * 0.4;
      ctx.fillRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4);
    }
    ctx.globalAlpha = 1;

    // Cabeza: el mismo verde aclarado con un velo blanco, para no parsear el
    // token —puede venir en cualquier formato— solo para subirle el brillo.
    const head = state.snake[0];
    const hx = head.x * CELL;
    const hy = head.y * CELL;
    ctx.fillStyle = green;
    ctx.fillRect(hx + 1, hy + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(hx + 1, hy + 1, CELL - 2, CELL - 2);

    // Ojos orientados al rumbo: dicen hacia dónde va sin leer nada.
    ctx.fillStyle = "#06140a";
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
   * Encola un giro y repinta. Guarda propia de `paused`: el motor ya descarta
   * un giro con la partida terminada, pero no sabe nada de la pausa.
   */
  const turn = useCallback(
    (apply: (state: SerpienteState) => void) => {
      const state = stateRef.current;
      if (!state || paused || state.over) return;
      apply(state);
    },
    [paused],
  );

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
      accum += Math.min(ts - last, MAX_DT);
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
        onOverRef.current();
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
      const dir: Dir | null =
        event.code === "ArrowUp"
          ? DIRS.up
          : event.code === "ArrowDown"
            ? DIRS.down
            : event.code === "ArrowLeft"
              ? DIRS.left
              : event.code === "ArrowRight"
                ? DIRS.right
                : null;
      if (!dir) return;
      // preventDefault() antes de cualquier guarda: en pausa las flechas
      // seguirían desplazando la página si no.
      event.preventDefault();
      turn((s) => enqueueDir(s, dir));
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
            turn((s) => enqueueDir(s, DIRS.up));
            break;
          case "down":
            turn((s) => enqueueDir(s, DIRS.down));
            break;
          case "left":
            turn((s) => enqueueDir(s, DIRS.left));
            break;
          case "right":
            turn((s) => enqueueDir(s, DIRS.right));
            break;
          case "a":
            turn((s) => enqueueTurn(s, 1));
            break;
          case "b":
            turn((s) => enqueueTurn(s, -1));
            break;
          default:
            break;
        }
      },
      release: () => {},
    }),
    [turn],
  );

  const padProps = (dir: Dir) => ({
    type: "button" as const,
    className: "btn",
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      turn((s) => enqueueDir(s, dir));
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
        {/* Franja propia bajo el tablero, nunca encima: la serpiente puede
            estar en cualquier celda, incluida la última fila. */}
        <div className="snake-pad">
          <button
            {...padProps(DIRS.up)}
            className="btn pad-up"
            aria-label="Girar hacia arriba"
          >
            ↑
          </button>
          <button
            {...padProps(DIRS.left)}
            className="btn pad-left"
            aria-label="Girar a la izquierda"
          >
            ←
          </button>
          <button
            {...padProps(DIRS.down)}
            className="btn pad-down"
            aria-label="Girar hacia abajo"
          >
            ↓
          </button>
          <button
            {...padProps(DIRS.right)}
            className="btn pad-right"
            aria-label="Girar a la derecha"
          >
            →
          </button>
        </div>
      </div>
    </>
  );
}

export const SerpienteGame = memo(SerpienteGameImpl);
