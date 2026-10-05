"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent,
  type Ref,
} from "react";
import type { PadAction, PadHandle } from "@/components/game-player";
import {
  BURST_MS,
  HEIGHT,
  PADDLE_W,
  WIDEN_PER_PICK,
  WIDTH,
  createState,
  movePaddle,
  serve,
  setPaddleX,
  step,
  type ArkanoidState,
} from "@/lib/arkanoid";
import { createSeededRng } from "@/lib/replay-rng";
import type { ArkanoidActionLog } from "@/lib/arkanoid-replay";

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

/**
 * Umbral de muestreo del arrastre de la pala en el registro de replay
 * (SPEC 36): una muestra nueva entra al log solo si ha pasado al menos este
 * tiempo desde la última, o si la x cambió más de SAMPLE_PX, lo que ocurra
 * primero. El arrastre en sí no se limita — sigue siendo `setPaddleX()` en
 * cada `pointermove` — solo lo que se registra para el replay.
 */
const SAMPLE_MS = 1000 / 30;
const SAMPLE_PX = 2;

export type ArkanoidRun = { score: number; lives: number; level: number };

type ArkanoidGameProps = {
  /** Lo controla el botón PAUSA del HUD. Con true, el bucle no avanza. */
  paused: boolean;
  /** Alterna la pausa: la tecla P llama aquí, no a un estado propio. */
  onTogglePause: () => void;
  /** El motor empuja aquí score / lives / level cuando cambian. */
  onRun: (run: ArkanoidRun) => void;
  /**
   * Última bola perdida: el reproductor abre el modal FIN DEL JUEGO. Lleva el
   * registro de la partida (SPEC 36) para que `game-player.tsx` pueda
   * mandarlo al replay en servidor antes de guardar.
   */
  onOver: (log: ArkanoidActionLog) => void;
  /** Vidas iniciales reales (`games.vidas`). */
  initialLives: number;
  /** Tope de nivel real (`games.niveles`); ARKANOID no lo usa (sin tope). */
  maxLevel: number | null;
  /** Donde se publica el PadHandle que pulsa el mando de móvil (SPEC 21). */
  padRef: Ref<PadHandle>;
  /** Semilla de `start_game_session` (SPEC 36): siembra el mismo generador que usará el replay. */
  seed: string;
};

export function ArkanoidGame({
  paused,
  onTogglePause,
  onRun,
  onOver,
  initialLives,
  padRef,
  seed,
}: ArkanoidGameProps) {
  const boardRef = useRef<HTMLCanvasElement | null>(null);

  // El estado del motor vive en un ref: a 60 fps un setState por fotograma
  // reconciliaría React para pintar en un canvas que React no gestiona.
  const stateRef = useRef<ArkanoidState | null>(null);
  if (stateRef.current === null)
    stateRef.current = createState(initialLives, createSeededRng(seed));

  const colorsRef = useRef<readonly string[]>(BRICK_FALLBACK);
  const inkRef = useRef("#e8f0ff");
  const lineRef = useRef("rgba(0, 245, 255, 0.18)");
  const cyanRef = useRef("#00f5ff");
  const greenRef = useRef("#00ff88");
  const redRef = useRef("#ff2f45");
  const lastRunRef = useRef<ArkanoidRun | null>(null);

  /**
   * Dirección que mantienen pulsada el teclado o los botones. La pala se mueve
   * mientras se mantiene, no por pulsación, así que el bucle lee esto cada
   * fotograma en vez de repetir con un `setInterval`.
   */
  const heldRef = useRef({ left: false, right: false });

  // Tiempo de juego acumulado, recortado por fotograma igual que `dt`: el
  // replay en servidor (SPEC 36) reproduce la física a partir de estos
  // mismos instantes.
  const gameTimeRef = useRef(0);
  const logRef = useRef<ArkanoidActionLog>([]);
  const prevPausedRef = useRef(paused);
  // Última muestra de arrastre que entró en el log, para el umbral de
  // cambio/frecuencia (SPEC 36). `null` fuerza que la primera muestra entre
  // siempre.
  const lastSampleRef = useRef<{ t: number; x: number } | null>(null);

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

    // Los premios: cuadrados planos de su color, sin halo —no son la bola.
    for (const drop of state.drops) {
      ctx.fillStyle = drop.kind === "ball" ? greenRef.current : redRef.current;
      ctx.fillRect(drop.x, drop.y, drop.w, drop.h);
    }

    // La pala: cuerpo cian de siempre, con el o los ensanches en rojo a cada
    // lado y una línea blanca por ensanche para contarlos de un vistazo.
    const { paddle, balls, widenings } = state;
    const widenPx = widenings * WIDEN_PER_PICK;
    ctx.fillStyle = cyanRef.current;
    ctx.fillRect(paddle.x + widenPx, paddle.y, PADDLE_W, paddle.h);
    if (widenPx > 0) {
      ctx.fillStyle = redRef.current;
      ctx.fillRect(paddle.x, paddle.y, widenPx, paddle.h);
      ctx.fillRect(paddle.x + widenPx + PADDLE_W, paddle.y, widenPx, paddle.h);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 1; i <= widenings; i++) {
        const w = i * WIDEN_PER_PICK;
        ctx.fillRect(paddle.x + w - 1, paddle.y, 1, paddle.h);
        ctx.fillRect(paddle.x + paddle.w - w, paddle.y, 1, paddle.h);
      }
    }
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(paddle.x, paddle.y, paddle.w * 0.18, paddle.h);
    ctx.fillRect(
      paddle.x + paddle.w * 0.82,
      paddle.y,
      paddle.w * 0.18,
      paddle.h,
    );

    // Las bolas: cuadrados con halo, se leen mejor en un tubo que un círculo.
    ctx.save();
    ctx.shadowBlur = 16;
    ctx.shadowColor = cyanRef.current;
    ctx.fillStyle = inkRef.current;
    for (const ball of balls) ctx.fillRect(ball.x, ball.y, ball.w, ball.h);
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
    const green = root.getPropertyValue("--green").trim();
    if (green) greenRef.current = green;
    const red = root.getPropertyValue("--red").trim();
    if (red) redRef.current = red;
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
      gameTimeRef.current += dt * 1000;

      const held = heldRef.current;
      if (held.left !== held.right) movePaddle(state, held.left ? -1 : 1, dt);
      step(state, dt);

      draw();
      publish();
      if (state.over) {
        onOverRef.current(logRef.current);
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, paused, publish]);

  // Con la pausa se sueltan las teclas: reanudar no debe arrastrar una
  // dirección que el jugador ya no mantiene.
  useEffect(() => {
    if (paused) heldRef.current = { left: false, right: false };
  }, [paused]);

  // Pausa/reanudación entran en el registro igual que cualquier cambio de
  // entrada: el replay en servidor (SPEC 36) ignora el tiempo entre ambas.
  // Solo transiciones reales tras montar, nunca el valor inicial.
  useEffect(() => {
    if (prevPausedRef.current === paused) return;
    prevPausedRef.current = paused;
    if (stateRef.current?.over) return;
    logRef.current.push({
      type: paused ? "pause" : "resume",
      t: gameTimeRef.current,
    });
  }, [paused]);

  /**
   * Único punto donde `heldRef.current[dir]` cambia, lo use el teclado, los
   * botones del tubo o el `PadHandle` del mando (SPEC 21): por eso es también
   * el único punto donde el registro de la partida (SPEC 36) crece para el
   * teclado, sin duplicar una entrada cuando el valor no cambia de verdad.
   */
  const setHeld = useCallback(
    (dir: "left" | "right", value: boolean) => {
      const state = stateRef.current;
      if (value && (!state || paused || state.over)) return;
      if (heldRef.current[dir] === value) return;
      heldRef.current[dir] = value;
      logRef.current.push({
        type:
          dir === "left"
            ? value
              ? "left_down"
              : "left_up"
            : value
              ? "right_down"
              : "right_up",
        t: gameTimeRef.current,
      });
    },
    [paused],
  );

  /** Único punto donde se llama a `serve(state)`: registra el saque antes. */
  const doServe = useCallback(() => {
    const state = stateRef.current;
    if (!state || paused || state.over) return;
    logRef.current.push({ type: "serve", t: gameTimeRef.current });
    serve(state);
  }, [paused]);

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
          setHeld("left", true);
          break;
        case "ArrowRight":
          event.preventDefault();
          setHeld("right", true);
          break;
        case "Space":
          // Sin preventDefault la página se desplaza.
          event.preventDefault();
          doServe();
          break;
        default:
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "ArrowLeft") setHeld("left", false);
      if (event.code === "ArrowRight") setHeld("right", false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [doServe, paused, setHeld]);

  /** Convierte la x del puntero a espacio lógico y coloca la pala. */
  const aim = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const state = stateRef.current;
      const canvas = boardRef.current;
      if (!state || !canvas || paused || state.over) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
      setPaddleX(state, x);
      draw();

      // Umbral de muestreo del registro (SPEC 36): el arrastre en sí no se
      // limita, solo lo que entra en el log para el replay.
      const now = gameTimeRef.current;
      const last = lastSampleRef.current;
      if (
        !last ||
        now - last.t >= SAMPLE_MS ||
        Math.abs(x - last.x) > SAMPLE_PX
      ) {
        lastSampleRef.current = { t: now, x };
        logRef.current.push({ type: "paddle_x", x, t: now });
      }
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
      doServe();
    },
    [aim, doServe, paused],
  );

  /**
   * El mando de móvil (SPEC 21) escribe el mismo `heldRef` que los botones de
   * dentro del tubo y llama al mismo `doServe()` que LANZAR. `up`, `down` y
   * `b` no existen en ARKANOID: el mando los pinta apagados.
   */
  useImperativeHandle(
    padRef,
    () => ({
      press: (action: PadAction) => {
        if (action === "left" || action === "right") {
          setHeld(action, true);
          return;
        }
        if (action !== "a") return;
        doServe();
      },
      release: (action: PadAction) => {
        if (action === "left" || action === "right") {
          setHeld(action, false);
        }
      },
    }),
    [doServe, setHeld],
  );

  /** Los dos botones de dirección se mantienen pulsados, como las flechas. */
  const holdProps = (side: "left" | "right") => ({
    type: "button" as const,
    className: "btn",
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setHeld(side, true);
    },
    onPointerUp: () => {
      setHeld(side, false);
    },
    onPointerCancel: () => {
      setHeld(side, false);
    },
    onPointerLeave: () => {
      setHeld(side, false);
    },
  });

  return (
    <>
      {/* Banda de leyenda: los dos premios que pueden caer, con su color. */}
      <div className="screen-legend">
        <span className="screen-legend-item">
          <span className="k ark-ball">●</span>BOLA EXTRA
        </span>
        <span className="screen-legend-item">
          <span className="k ark-paddle">▬</span>+ PALA
        </span>
      </div>
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
              doServe();
            }}
          >
            LANZAR
          </button>
          <button
            {...holdProps("right")}
            aria-label="Mover la pala a la derecha"
          >
            →
          </button>
        </div>
      </div>
    </>
  );
}
