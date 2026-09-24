"use client";

import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import {
  COLS,
  ROWS,
  createState,
  dropIntervalMs,
  ghostY,
  hardDrop,
  move,
  rotate,
  softDrop,
  tick,
  type Shape,
  type TetrisState,
} from "@/lib/tetris";

/** Lado de la celda en píxeles lógicos: el canvas mide 300 × 600. */
const BLOCK = 30;
/** Celdas del recuadro de la pieza siguiente. */
const NEXT_CELLS = 4;
/** Repetición mientras se mantiene pulsado un botón de la cruceta. */
const REPEAT_MS = 110;

/** Tokens de `:root`; el CSS es la única fuente de verdad de la paleta. */
const PIECE_VARS = [
  "--piece-i",
  "--piece-o",
  "--piece-t",
  "--piece-s",
  "--piece-z",
  "--piece-j",
  "--piece-l",
] as const;

/** Respaldo por si algún token desapareciera: un tablero invisible no se juega. */
const PIECE_FALLBACK = [
  "#00f5ff",
  "#f5ff00",
  "#ff006e",
  "#00ff88",
  "#ff5a1f",
  "#8a5cff",
  "#0077ff",
] as const;

/** Caja de las celdas llenas de una pieza, en coordenadas de su matriz. */
function filledBox(shape: Shape) {
  let minR = shape.length;
  let maxR = -1;
  let minC = shape[0].length;
  let maxC = -1;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
  }
  return { minR, maxR, minC, maxC };
}

export type TetrisRun = { score: number; lives: number; level: number };

type TetrisGameProps = {
  /** Lo controla el botón PAUSA del HUD. Con true, el bucle no avanza. */
  paused: boolean;
  /** Alterna la pausa: la tecla P llama aquí, no a un estado propio. */
  onTogglePause: () => void;
  /** El motor empuja aquí score / lives / level cuando cambian. */
  onRun: (run: TetrisRun) => void;
  /** Top-out: el reproductor abre el modal FIN DEL JUEGO. */
  onOver: () => void;
};

export function TetrisGame({
  paused,
  onTogglePause,
  onRun,
  onOver,
}: TetrisGameProps) {
  const boardRef = useRef<HTMLCanvasElement | null>(null);
  const nextRef = useRef<HTMLCanvasElement | null>(null);

  // El estado del motor vive en un ref: a 60 fps un setState por fotograma
  // reconciliaría React para pintar en un canvas que React no gestiona.
  const stateRef = useRef<TetrisState | null>(null);
  if (stateRef.current === null) stateRef.current = createState();

  const colorsRef = useRef<readonly string[]>(PIECE_FALLBACK);
  const gridRef = useRef("rgba(0, 245, 255, 0.18)");
  const lastRunRef = useRef<TetrisRun | null>(null);
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  const context2d = useCallback(
    (canvas: HTMLCanvasElement, w: number, h: number) => {
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    },
    [],
  );

  const drawBlock = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      type: number,
      size: number,
      alpha = 1,
    ) => {
      if (!type) return;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colorsRef.current[type - 1] ?? PIECE_FALLBACK[0];
      ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      ctx.globalAlpha = 1;
    },
    [],
  );

  const drawShape = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      shape: Shape,
      ox: number,
      oy: number,
      size: number,
      alpha = 1,
    ) => {
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          drawBlock(ctx, ox + c, oy + r, shape[r][c], size, alpha);
        }
      }
    },
    [drawBlock],
  );

  const draw = useCallback(() => {
    const state = stateRef.current;
    const boardCanvas = boardRef.current;
    if (!state || !boardCanvas) return;

    const ctx = context2d(boardCanvas, COLS * BLOCK, ROWS * BLOCK);
    if (ctx) {
      ctx.clearRect(0, 0, COLS * BLOCK, ROWS * BLOCK);

      ctx.strokeStyle = gridRef.current;
      ctx.lineWidth = 0.5;
      for (let c = 1; c < COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * BLOCK, 0);
        ctx.lineTo(c * BLOCK, ROWS * BLOCK);
        ctx.stroke();
      }
      for (let r = 1; r < ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * BLOCK);
        ctx.lineTo(COLS * BLOCK, r * BLOCK);
        ctx.stroke();
      }

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          drawBlock(ctx, c, r, state.board[r][c], BLOCK);
        }
      }

      if (!state.over) {
        const { current } = state;
        drawShape(ctx, current.shape, current.x, ghostY(state), BLOCK, 0.2);
        drawShape(ctx, current.shape, current.x, current.y, BLOCK);
      }
    }

    const nextCanvas = nextRef.current;
    if (!nextCanvas) return;
    const nextCtx = context2d(
      nextCanvas,
      NEXT_CELLS * BLOCK,
      NEXT_CELLS * BLOCK,
    );
    if (!nextCtx) return;
    nextCtx.clearRect(0, 0, NEXT_CELLS * BLOCK, NEXT_CELLS * BLOCK);
    const { shape } = state.next;
    // Las matrices llevan filas y columnas vacías (la I ocupa una fila de 4×4),
    // así que centrar por el tamaño de la matriz deja la pieza arriba a la
    // izquierda. Se centra por la caja de las celdas llenas, con decimales.
    const box = filledBox(shape);
    drawShape(
      nextCtx,
      shape,
      (NEXT_CELLS - (box.maxC - box.minC + 1)) / 2 - box.minC,
      (NEXT_CELLS - (box.maxR - box.minR + 1)) / 2 - box.minR,
      BLOCK,
    );
  }, [context2d, drawBlock, drawShape]);

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
    colorsRef.current = PIECE_VARS.map((name, i) => {
      const value = root.getPropertyValue(name).trim();
      return value || PIECE_FALLBACK[i];
    });
    const line = root.getPropertyValue("--line").trim();
    if (line) gridRef.current = line;
    draw();
    publish();
  }, [draw, publish]);

  /** Aplica una acción del jugador y repinta. */
  const act = useCallback(
    (action: (state: TetrisState) => void) => {
      const state = stateRef.current;
      if (!state || paused || state.over) return;
      action(state);
      draw();
      publish();
      if (state.over) onOverRef.current();
    },
    [draw, paused, publish],
  );

  // Bucle de caída.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    draw();
    if (paused || state.over) return;

    let raf = 0;
    let last = performance.now();
    let accum = 0;

    const loop = (ts: number) => {
      accum += ts - last;
      last = ts;
      let interval = dropIntervalMs(state.level);
      while (accum >= interval && !state.over) {
        accum -= interval;
        tick(state);
        interval = dropIntervalMs(state.level);
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

  // Teclado: los mismos atajos que la referencia.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyP") {
        event.preventDefault();
        onTogglePauseRef.current();
        return;
      }
      const state = stateRef.current;
      if (!state || paused || state.over) return;
      switch (event.code) {
        case "ArrowLeft":
          event.preventDefault();
          act((s) => move(s, -1));
          break;
        case "ArrowRight":
          event.preventDefault();
          act((s) => move(s, 1));
          break;
        case "ArrowDown":
          event.preventDefault();
          act(softDrop);
          break;
        case "ArrowUp":
        case "KeyX":
          event.preventDefault();
          act(rotate);
          break;
        case "Space":
          event.preventDefault();
          act(hardDrop);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [act, paused]);

  const stopRepeat = useCallback(() => {
    if (repeatRef.current === null) return;
    clearInterval(repeatRef.current);
    repeatRef.current = null;
  }, []);

  useEffect(() => stopRepeat, [stopRepeat]);

  /** Pulsación de la cruceta; mover y bajar se repiten mientras se mantiene. */
  const press = useCallback(
    (action: (state: TetrisState) => void, repeat: boolean) => {
      act(action);
      if (!repeat) return;
      stopRepeat();
      repeatRef.current = setInterval(() => act(action), REPEAT_MS);
    },
    [act, stopRepeat],
  );

  const padProps = (action: (state: TetrisState) => void, repeat: boolean) => ({
    type: "button" as const,
    className: "btn",
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      press(action, repeat);
    },
    onPointerUp: stopRepeat,
    onPointerCancel: stopRepeat,
    onPointerLeave: stopRepeat,
  });

  return (
    <div className="tetris-stage">
      <canvas
        ref={boardRef}
        className="tetris-board"
        width={COLS * BLOCK}
        height={ROWS * BLOCK}
        role="img"
        aria-label="Tablero de TETRIX"
      />
      <div className="tetris-side">
        <div className="tetris-block">
          <span className="l">MOVIMIENTO</span>
          <div className="tetris-pad">
            <button
              {...padProps(rotate, false)}
              className="btn pad-rot"
              aria-label="Rotar la pieza"
            >
              ↻
            </button>
            <button
              {...padProps((s) => move(s, -1), true)}
              className="btn pad-left"
              aria-label="Mover a la izquierda"
            >
              ←
            </button>
            <button
              {...padProps(softDrop, true)}
              className="btn pad-down"
              aria-label="Bajar más rápido"
            >
              ↓
            </button>
            <button
              {...padProps((s) => move(s, 1), true)}
              className="btn pad-right"
              aria-label="Mover a la derecha"
            >
              →
            </button>
          </div>
        </div>
        <div className="tetris-block">
          <span className="l">BAJAR</span>
          <button
            {...padProps(hardDrop, false)}
            className="btn magenta pad-drop"
            aria-label="Caída instantánea"
          >
            ▼▼
          </button>
        </div>
        <div className="tetris-block tetris-next">
          <span className="l">SIGUIENTE</span>
          <canvas
            ref={nextRef}
            width={NEXT_CELLS * BLOCK}
            height={NEXT_CELLS * BLOCK}
            role="img"
            aria-label="Pieza siguiente"
          />
        </div>
      </div>
    </div>
  );
}
