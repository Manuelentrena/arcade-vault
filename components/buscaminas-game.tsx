"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import type { PadAction, PadHandle } from "@/components/game-player";
import {
  CELL,
  COLS,
  HEIGHT,
  ROWS,
  WIDTH,
  createState,
  minesForLevel,
  moveCursor,
  reveal,
  setCursor,
  toggleFlag,
  type BuscaminasState,
} from "@/lib/buscaminas";

/** Repetición del cursor mientras se mantiene una flecha o la cruceta. */
const REPEAT_DELAY = 300;
const REPEAT_RATE = 70;

const ARROWS: readonly [code: string, dx: -1 | 0 | 1, dy: -1 | 0 | 1][] = [
  ["ArrowUp", 0, -1],
  ["ArrowDown", 0, 1],
  ["ArrowLeft", -1, 0],
  ["ArrowRight", 1, 0],
];

/** Colores de adyacencia (1-8): los ocho tokens neón/mezcla ya existentes. */
type Palette = {
  adjacency: readonly string[]; // índice 1-8; el 0 no se usa
  cursor: string;
  flag: string;
  ink: string;
  inkFaint: string;
};

const ADJACENCY_VARS = [
  "",
  "--cyan",
  "--green",
  "--magenta",
  "--silver",
  "--piece-z",
  "--piece-j",
  "--piece-l",
  "--yellow",
] as const;

const PALETTE_FALLBACK: Palette = {
  adjacency: [
    "",
    "#00f5ff",
    "#00ff88",
    "#ff006e",
    "#c7d0e0",
    "#ff5a1f",
    "#8a5cff",
    "#0077ff",
    "#f5ff00",
  ],
  cursor: "#00ff88",
  flag: "#ff006e",
  ink: "#e6e9ff",
  inkFaint: "#4a4f70",
};

/** Fondo del escenario, sin tokenizar: mismo criterio que `.tetris-stage`. */
const HIDDEN_FILL = "#3a3a3a";
const REVEALED_FILL = "#161616";
const REVEALED_MINE_FILL = "#5c1a1a";
const CELL_BORDER = "#000";

export type BuscaminasRun = { score: number; lives: number; level: number };

type BuscaminasGameProps = {
  paused: boolean;
  onTogglePause: () => void;
  onRun: (run: BuscaminasRun) => void;
  onOver: () => void;
  initialLives: number;
  /** Ignorado: el nivel de BUSCAMINAS no tiene techo (games.niveles = null). */
  maxLevel: number | null;
  /** Donde se publica el PadHandle que pulsa el mando de móvil (SPEC 21). */
  padRef: Ref<PadHandle>;
};

/**
 * Las seis entradas del mando de móvil al `code` de teclado equivalente
 * (SPEC 21). BUSCAMINAS es el único juego que usa las seis.
 */
const PAD_CODES: Record<PadAction, string> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  a: "Space",
  b: "KeyF",
};

function drawFlag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colors: Palette,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = colors.inkFaint;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 9);
  ctx.lineTo(0, -9);
  ctx.stroke();
  ctx.fillStyle = colors.flag;
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(9, -5);
  ctx.lineTo(0, -1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = colors.inkFaint;
  ctx.fillRect(-6, 9, 12, 2.5);
  ctx.restore();
}

function drawMine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colors: Palette,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = colors.inkFaint;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
    ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
    ctx.stroke();
  }
  ctx.fillStyle = colors.inkFaint;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.ink;
  ctx.beginPath();
  ctx.arc(-2, -2, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function BuscaminasGame({
  paused,
  onTogglePause,
  onRun,
  onOver,
  initialLives,
  padRef,
}: BuscaminasGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // El estado del motor vive en un ref: a 60 fps un setState por fotograma
  // reconciliaría React para pintar en un canvas que React no gestiona.
  const stateRef = useRef<BuscaminasState | null>(null);
  if (stateRef.current === null) stateRef.current = createState(initialLives);

  const paletteRef = useRef<Palette>(PALETTE_FALLBACK);
  const lastRunRef = useRef<BuscaminasRun | null>(null);

  // Teclado y cruceta táctil escriben en el mismo objeto: `pressed()` sólo
  // devuelve true una vez por pulsación, `held` mantiene la repetición.
  const heldRef = useRef<Record<string, boolean>>({});
  const justRef = useRef<Record<string, boolean>>({});
  const repeatAtRef = useRef<Record<string, number>>({});

  // Callbacks en refs para que el bucle no se reinicie cuando el padre repinta.
  const onRunRef = useRef(onRun);
  const onOverRef = useRef(onOver);
  const onTogglePauseRef = useRef(onTogglePause);
  useEffect(() => {
    onRunRef.current = onRun;
    onOverRef.current = onOver;
    onTogglePauseRef.current = onTogglePause;
  }, [onRun, onOver, onTogglePause]);

  const markDown = useCallback((code: string) => {
    if (!heldRef.current[code]) justRef.current[code] = true;
    heldRef.current[code] = true;
  }, []);
  const markUp = useCallback((code: string) => {
    heldRef.current[code] = false;
  }, []);
  const pressed = useCallback((code: string) => {
    const val = !!justRef.current[code];
    justRef.current[code] = false;
    return val;
  }, []);

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

  const draw = useCallback(() => {
    const state = stateRef.current;
    const canvas = canvasRef.current;
    if (!state || !canvas) return;
    const ctx = context2d(canvas);
    if (!ctx) return;
    const colors = paletteRef.current;

    ctx.fillStyle = CELL_BORDER;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = state.board[r][c];
        const x = c * CELL;
        const y = r * CELL;
        const cx = x + CELL / 2;
        const cy = y + CELL / 2;

        if (cell.revealed) {
          ctx.fillStyle = cell.mine ? REVEALED_MINE_FILL : REVEALED_FILL;
          ctx.fillRect(x, y, CELL, CELL);
          ctx.strokeStyle = CELL_BORDER;
          ctx.strokeRect(x, y, CELL, CELL);

          if (cell.mine) {
            drawMine(ctx, cx, cy, colors);
          } else if (cell.adjacent > 0) {
            ctx.fillStyle = colors.adjacency[cell.adjacent] ?? colors.ink;
            ctx.font = "bold 16px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(cell.adjacent), cx, cy + 1);
          }
        } else {
          ctx.fillStyle = HIDDEN_FILL;
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          ctx.strokeStyle = CELL_BORDER;
          ctx.strokeRect(x, y, CELL, CELL);
          if (cell.flagged) drawFlag(ctx, cx, cy, colors);
        }
      }
    }

    const hx = state.cursor.col * CELL;
    const hy = state.cursor.row * CELL;
    ctx.strokeStyle = colors.cursor;
    ctx.lineWidth = 3;
    ctx.strokeRect(hx + 1.5, hy + 1.5, CELL - 3, CELL - 3);
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
    const run = { score: state.score, lives: state.lives, level: state.level };
    lastRunRef.current = run;
    onRunRef.current(run);
  }, []);

  /**
   * Lo único del estado del motor que sale a React además del HUD: las
   * banderas puestas y las minas del nivel, que son la leyenda de BUSCAMINAS.
   * Devolver `prev` cuando no cambia nada hace que React descarte el render,
   * así que llamarlo tras cada acción no cuesta un repintado de más.
   */
  const [legend, setLegend] = useState({
    flags: 0,
    mines: minesForLevel(1),
  });
  const syncLegend = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    setLegend((prev) =>
      prev.flags === state.flags && prev.mines === state.mines
        ? prev
        : { flags: state.flags, mines: state.mines },
    );
  }, []);

  /** Aplica una acción discreta (revelar, bandera) y repinta. */
  const act = useCallback(
    (action: (state: BuscaminasState) => void) => {
      const state = stateRef.current;
      if (!state || paused || state.over) return;
      action(state);
      draw();
      publish();
      // Las banderas y las minas solo cambian aquí: poner o quitar una marca,
      // y el salto de nivel que reparte minas nuevas.
      syncLegend();
      if (state.over) onOverRef.current();
    },
    [draw, paused, publish, syncLegend],
  );

  // Los colores salen del tema: se leen una vez al montar.
  useEffect(() => {
    const root = getComputedStyle(document.documentElement);
    const adjacency = ADJACENCY_VARS.map((name, i) => {
      if (!name) return "";
      const value = root.getPropertyValue(name).trim();
      return value || PALETTE_FALLBACK.adjacency[i];
    });
    const cursor = root.getPropertyValue("--green").trim();
    const flag = root.getPropertyValue("--magenta").trim();
    const ink = root.getPropertyValue("--ink").trim();
    const inkFaint = root.getPropertyValue("--ink-faint").trim();
    paletteRef.current = {
      adjacency,
      cursor: cursor || PALETTE_FALLBACK.cursor,
      flag: flag || PALETTE_FALLBACK.flag,
      ink: ink || PALETTE_FALLBACK.ink,
      inkFaint: inkFaint || PALETTE_FALLBACK.inkFaint,
    };
    draw();
    publish();
  }, [draw, publish]);

  // Bucle: sin gravedad ni caída automática, sólo repinta y gestiona la
  // repetición de tecla/cruceta. Revelar y marcar son de un solo disparo,
  // detectado con `pressed()` igual que en la referencia.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    draw();
    if (paused || state.over) return;

    let raf = 0;

    const loop = (ts: number) => {
      for (const [code, dx, dy] of ARROWS) {
        const nextAt = repeatAtRef.current[code] ?? 0;
        if (pressed(code)) {
          moveCursor(state, dx, dy);
          repeatAtRef.current[code] = ts + REPEAT_DELAY;
        } else if (heldRef.current[code] && ts >= nextAt) {
          moveCursor(state, dx, dy);
          repeatAtRef.current[code] = ts + REPEAT_RATE;
        }
      }
      if (pressed("Space")) reveal(state);
      if (pressed("KeyF")) toggleFlag(state);

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
  }, [draw, paused, pressed, publish]);

  // Soltar todas las teclas mantenidas al pausar o desmontar.
  useEffect(() => {
    if (!paused) return;
    heldRef.current = {};
  }, [paused]);
  useEffect(() => () => void (heldRef.current = {}), []);

  // Teclado. Las cuatro flechas y Espacio cancelan su efecto por defecto,
  // para que la página no se desplace.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyP") {
        event.preventDefault();
        onTogglePauseRef.current();
        return;
      }
      // preventDefault se aplica siempre para estas teclas, pause o no: si el
      // foco quedó en el botón PAUSA/REANUDAR del HUD, un Espacio sin cancelar
      // activaría ese botón (semántica nativa del <button>) y reanudaría la
      // partida por accidente.
      switch (event.code) {
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight":
        case "Space":
          event.preventDefault();
          break;
        default:
          break;
      }
      const state = stateRef.current;
      if (!state || paused || state.over) return;
      switch (event.code) {
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight":
        case "Space":
          markDown(event.code);
          break;
        case "KeyF":
          markDown("KeyF");
          break;
        default:
          break;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight":
          event.preventDefault();
          markUp(event.code);
          break;
        case "Space":
          markUp("Space");
          break;
        case "KeyF":
          markUp("KeyF");
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [markDown, markUp, paused]);

  /** Fila/columna bajo un evento de puntero, o null si cae fuera de la rejilla. */
  const cellFromEvent = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const col = Math.floor((x / rect.width) * COLS);
      const row = Math.floor((y / rect.height) * ROWS);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
      return { row, col };
    },
    [],
  );

  // Ratón sobre el tablero: el puntero mueve el mismo `state.cursor` que el
  // teclado, y los dos botones disparan las mismas dos acciones que
  // Espacio/F. No es un segundo motor de reglas.
  const onBoardPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const state = stateRef.current;
      if (!state || paused || state.over) return;
      const cell = cellFromEvent(event);
      if (!cell) return;
      setCursor(state, cell.row, cell.col);
      draw();
    },
    [cellFromEvent, draw, paused],
  );

  const onBoardPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const state = stateRef.current;
      if (!state || paused || state.over) return;
      const cell = cellFromEvent(event);
      if (!cell) return;
      setCursor(state, cell.row, cell.col);
      if (event.button === 2) act(toggleFlag);
      else if (event.button === 0) act(reveal);
    },
    [act, cellFromEvent, paused],
  );

  /**
   * El mando de móvil (SPEC 21) pasa por `markDown`/`markUp`, los mismos que
   * el teclado y la cruceta de dentro del tubo: aquí no hay lógica de entrada
   * nueva, solo la traducción de PadAction al `code` de cada tecla.
   */
  useImperativeHandle(
    padRef,
    () => ({
      press: (action: PadAction) => {
        const code = PAD_CODES[action];
        if (code) markDown(code);
      },
      release: (action: PadAction) => {
        const code = PAD_CODES[action];
        if (code) markUp(code);
      },
    }),
    [markDown, markUp],
  );

  /** Cruceta y REVELAR/MARCAR: mismo camino que un teclado o un mando físico. */
  const padProps = (code: string) => ({
    type: "button" as const,
    className: "btn",
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      markDown(code);
    },
    onPointerUp: () => markUp(code),
    onPointerCancel: () => markUp(code),
    onPointerLeave: () => markUp(code),
  });

  return (
    <>
      {/* La leyenda de BUSCAMINAS: banderas puestas sobre las disponibles —que
          son tantas como minas— y el total de minas del nivel. */}
      <div className="screen-legend">
        <span className="screen-legend-item">
          <span className="k flag">⚑</span>
          {legend.flags} / {legend.mines}
        </span>
        <span className="screen-legend-item">
          <span className="k mine">◉</span>
          {legend.mines} MINAS
        </span>
      </div>
      <div className="minas-stage">
        <canvas
          ref={canvasRef}
          className="minas-board"
          width={WIDTH}
          height={HEIGHT}
          role="img"
          aria-label="Rejilla de BUSCAMINAS"
          onPointerMove={onBoardPointerMove}
          onPointerDown={onBoardPointerDown}
          onContextMenu={(event) => event.preventDefault()}
        />
        <div className="minas-side">
          <div className="minas-block">
            <span className="l">MOVIMIENTO</span>
            <div className="minas-pad">
              <button
                {...padProps("ArrowUp")}
                className="btn pad-up"
                aria-label="Mover el cursor arriba"
              >
                ▲
              </button>
              <button
                {...padProps("ArrowLeft")}
                className="btn pad-left"
                aria-label="Mover el cursor a la izquierda"
              >
                ◀
              </button>
              <button
                {...padProps("ArrowDown")}
                className="btn pad-down"
                aria-label="Mover el cursor abajo"
              >
                ▼
              </button>
              <button
                {...padProps("ArrowRight")}
                className="btn pad-right"
                aria-label="Mover el cursor a la derecha"
              >
                ▶
              </button>
            </div>
          </div>
          <div className="minas-block">
            <span className="l">REVELAR</span>
            <button
              {...padProps("Space")}
              className="btn pad-reveal"
              aria-label="Revelar la celda"
            >
              ␣ REVELAR
            </button>
          </div>
          <div className="minas-block">
            <span className="l">MARCAR</span>
            <button
              {...padProps("KeyF")}
              className="btn magenta pad-flag"
              aria-label="Marcar con bandera"
            >
              ⚑ MARCAR
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
