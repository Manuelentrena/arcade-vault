"use client";

import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import {
  BURST_MS,
  HEIGHT,
  WIDTH,
  createState,
  movePaddle,
  serve,
  setPaddleX,
  step,
  type ArkanoidState,
} from "@/lib/arkanoid";

/** Tokens de `:root`; el CSS es la única fuente de verdad de la paleta. */
const BRICK_VARS = [
  "--brick-cyan",
  "--brick-magenta",
  "--brick-yellow",
  "--brick-green",
  "--brick-amber",
  "--brick-violet",
  "--brick-silver",
] as const;

/** Respaldo por si algún token desapareciera: un muro invisible no se juega. */
const BRICK_FALLBACK = [
  "#00f5ff",
  "#ff006e",
  "#f5ff00",
  "#00ff88",
  "#ff5a1f",
  "#8a5cff",
  "#c7d0e0",
] as const;

/** Cuánto se expande el destello de un ladrillo roto, en tanto por uno. */
const BURST_GROWTH = 0.4;

/** Tope de `dt` por fotograma: volver de una pestaña en segundo plano no salta. */
const MAX_DT = 0.05;

export type ArkanoidRun = { score: number; lives: number; level: number };

type ArkanoidGameProps = {
  /** Lo controla el botón PAUSA del HUD. Con true, el bucle no avanza. */
  paused: boolean;
  /** Alterna la pausa: la tecla P llama aquí, no a un estado propio. */
  onTogglePause: () => void;
  /** El motor empuja aquí score / lives / level cuando cambian. */
  onRun: (run: ArkanoidRun) => void;
  /** Última bola perdida: el reproductor abre el modal FIN DEL JUEGO. */
  onOver: () => void;
};

export function ArkanoidGame({
  paused,
  onTogglePause,
  onRun,
  onOver,
}: ArkanoidGameProps) {
  const boardRef = useRef<HTMLCanvasElement | null>(null);

  // El estado del motor vive en un ref: a 60 fps un setState por fotograma
  // reconciliaría React para pintar en un canvas que React no gestiona.
  const stateRef = useRef<ArkanoidState | null>(null);
  if (stateRef.current === null) stateRef.current = createState();

  const colorsRef = useRef<readonly string[]>(BRICK_FALLBACK);
  const inkRef = useRef("#e8f0ff");
  const lineRef = useRef("rgba(0, 245, 255, 0.18)");
  const cyanRef = useRef("#00f5ff");
  const lastRunRef = useRef<ArkanoidRun | null>(null);

  /**
   * Dirección que mantienen pulsada el teclado o los botones. La pala se mueve
   * mientras se mantiene, no por pulsación, así que el bucle lee esto cada
   * fotograma en vez de repetir con un `setInterval`.
   */
  const heldRef = useRef({ left: false, right: false });

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

  /** Un ladrillo: su color con 1 px de aire y la banda superior de TETRIX. */
  const drawBrick = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      type: number,
    ) => {
      ctx.fillStyle = colorsRef.current[type - 1] ?? BRICK_FALLBACK[0];
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x + 1, y + 1, w - 2, 4);
    },
    [],
  );

  const draw = useCallback(() => {
    const state = stateRef.current;
    const canvas = boardRef.current;
    if (!state || !canvas) return;
    const ctx = context2d(canvas);
    if (!ctx) return;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Las tres paredes que rebotan. La de abajo se deja abierta a propósito.
    ctx.strokeStyle = lineRef.current;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1, HEIGHT);
    ctx.lineTo(1, 1);
    ctx.lineTo(WIDTH - 1, 1);
    ctx.lineTo(WIDTH - 1, HEIGHT);
    ctx.stroke();

    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      drawBrick(ctx, brick.x, brick.y, brick.w, brick.h, brick.type);
    }

    // Destellos: el mismo rectángulo, expandido y desvaneciéndose.
    for (const burst of state.bursts) {
      const t = Math.min(1, burst.elapsed / BURST_MS);
      const grow = 1 + BURST_GROWTH * t;
      const w = burst.w * grow;
      const h = burst.h * grow;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = colorsRef.current[burst.type - 1] ?? BRICK_FALLBACK[0];
      ctx.fillRect(
        burst.x - (w - burst.w) / 2,
        burst.y - (h - burst.h) / 2,
        w,
        h,
      );
      ctx.globalAlpha = 1;
    }

    // La pala, con los extremos más claros: es donde cambia el ángulo.
    const { paddle, ball } = state;
    ctx.fillStyle = cyanRef.current;
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(paddle.x, paddle.y, paddle.w * 0.18, paddle.h);
    ctx.fillRect(
      paddle.x + paddle.w * 0.82,
      paddle.y,
      paddle.w * 0.18,
      paddle.h,
    );

    // La bola: un cuadrado con halo se lee mejor en un tubo que un círculo.
    ctx.save();
    ctx.shadowBlur = 16;
    ctx.shadowColor = cyanRef.current;
    ctx.fillStyle = inkRef.current;
    ctx.fillRect(ball.x, ball.y, ball.w, ball.h);
    ctx.restore();
  }, [context2d, drawBrick]);

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
    colorsRef.current = BRICK_VARS.map((name, i) => {
      const value = root.getPropertyValue(name).trim();
      return value || BRICK_FALLBACK[i];
    });
    const ink = root.getPropertyValue("--ink").trim();
    if (ink) inkRef.current = ink;
    const line = root.getPropertyValue("--line").trim();
    if (line) lineRef.current = line;
    const cyan = root.getPropertyValue("--cyan").trim();
    if (cyan) cyanRef.current = cyan;
    draw();
    publish();
  }, [draw, publish]);

  // Bucle. Con la pausa se cancela y al reanudar se reinicia `last`, para que
  // la pausa no acumule un salto.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    draw();
    if (paused || state.over) return;

    let raf = 0;
    let last = performance.now();

    const loop = (ts: number) => {
      const dt = Math.min(MAX_DT, (ts - last) / 1000);
      last = ts;

      const held = heldRef.current;
      if (held.left !== held.right) movePaddle(state, held.left ? -1 : 1, dt);
      step(state, dt);

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

  // Teclado: la pala se mueve mientras se mantiene, así que se guardan las
  // teclas pulsadas y las lee el bucle.
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
          heldRef.current.left = true;
          break;
        case "ArrowRight":
          event.preventDefault();
          heldRef.current.right = true;
          break;
        case "Space":
          // Sin preventDefault la página se desplaza.
          event.preventDefault();
          serve(state);
          break;
        default:
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "ArrowLeft") heldRef.current.left = false;
      if (event.code === "ArrowRight") heldRef.current.right = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [paused]);

  // Con la pausa se sueltan las teclas: reanudar no debe arrastrar una
  // dirección que el jugador ya no mantiene.
  useEffect(() => {
    if (paused) heldRef.current = { left: false, right: false };
  }, [paused]);

  /** Convierte la x del puntero a espacio lógico y coloca la pala. */
  const aim = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const state = stateRef.current;
      const canvas = boardRef.current;
      if (!state || !canvas || paused || state.over) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      setPaddleX(state, ((event.clientX - rect.left) / rect.width) * WIDTH);
      draw();
    },
    [draw, paused],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const state = stateRef.current;
      if (!state || paused || state.over) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      aim(event);
      // Tocar el tablero con la bola en la pala también lanza.
      serve(state);
    },
    [aim, paused],
  );

  /** Los dos botones de dirección se mantienen pulsados, como las flechas. */
  const holdProps = (side: "left" | "right") => ({
    type: "button" as const,
    className: "btn",
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      heldRef.current[side] = true;
    },
    onPointerUp: () => {
      heldRef.current[side] = false;
    },
    onPointerCancel: () => {
      heldRef.current[side] = false;
    },
    onPointerLeave: () => {
      heldRef.current[side] = false;
    },
  });

  return (
    <div className="ark-stage">
      <canvas
        ref={boardRef}
        className="ark-board"
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label="Tablero de ARKANOID"
        onPointerDown={onPointerDown}
        onPointerMove={aim}
      />
      <div className="ark-pad">
        <button
          {...holdProps("left")}
          aria-label="Mover la pala a la izquierda"
        >
          ←
        </button>
        <button
          type="button"
          className="btn"
          aria-label="Lanzar la bola"
          onPointerDown={(event) => {
            event.preventDefault();
            const state = stateRef.current;
            if (!state || paused || state.over) return;
            serve(state);
          }}
        >
          LANZAR
        </button>
        <button {...holdProps("right")} aria-label="Mover la pala a la derecha">
          →
        </button>
      </div>
    </div>
  );
}
