"use client";

import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import {
  DROP_RADIUS,
  MAX_DT,
  RADII,
  WORLD_H,
  WORLD_W,
  createState,
  step,
  type AsteroidsState,
  type Input,
} from "@/lib/asteroids";

/** Las ocho tintas del juego, una por elemento. */
type Palette = {
  ship: string;
  rock: string;
  bullet: string;
  flame: string;
  triple: string;
  shield: string;
  grid: string;
  horizon: string;
};

/** Tokens de `:root`; el CSS es la única fuente de verdad de la paleta. */
const ROCK_VARS: Record<keyof Palette, string> = {
  ship: "--rock-ship",
  rock: "--rock-rock",
  bullet: "--rock-bullet",
  flame: "--rock-flame",
  triple: "--rock-triple",
  shield: "--rock-shield",
  grid: "--rock-grid",
  horizon: "--rock-horizon",
};

/** Respaldo por si el tema no hubiera cargado: un campo invisible no se juega. */
const ROCK_FALLBACK: Palette = {
  ship: "#00f5ff",
  rock: "#8a5cff",
  bullet: "#f5ff00",
  flame: "#ff5a1f",
  triple: "#ff006e",
  shield: "#00ff88",
  grid: "rgba(0, 245, 255, 0.14)",
  horizon: "rgba(255, 0, 110, 0.35)",
};

export type AsteroidsRun = { score: number; lives: number; level: number };

type AsteroidsGameProps = {
  /** Lo controla el botón PAUSA del HUD. Con true, el bucle no avanza. */
  paused: boolean;
  /** Alterna la pausa: la tecla P llama aquí, no a un estado propio. */
  onTogglePause: () => void;
  /** El motor empuja aquí score / lives / level cuando cambian. */
  onRun: (run: AsteroidsRun) => void;
  /** Choque sin escudo: el reproductor abre el modal FIN DEL JUEGO. */
  onOver: () => void;
};

/** Altura del horizonte: la rejilla vive por debajo. */
const HORIZON_Y = WORLD_H * 0.5;
/** Líneas horizontales de la rejilla, cada vez más juntas hacia el fondo. */
const GRID_ROWS = 14;
/** Líneas de fuga hacia el punto central. */
const GRID_COLS = 16;

/**
 * Fondo retro: el mismo degradado azul-negro de `.tetris-stage`, un horizonte
 * magenta y una rejilla en perspectiva. Va quieta y muy tenue a propósito: el
 * mundo envuelve por los bordes y un suelo con contraste prometería una
 * dirección que no existe.
 */
function drawBackdrop(ctx: CanvasRenderingContext2D, colors: Palette) {
  const sky = ctx.createRadialGradient(
    WORLD_W / 2,
    WORLD_H / 2,
    0,
    WORLD_W / 2,
    WORLD_H / 2,
    WORLD_H * 0.85,
  );
  sky.addColorStop(0, "#0a0030");
  sky.addColorStop(0.7, "#000");
  sky.addColorStop(1, "#000");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Resplandor corto por encima de la línea de horizonte.
  const glow = ctx.createLinearGradient(0, HORIZON_Y - 40, 0, HORIZON_Y);
  glow.addColorStop(0, "rgba(255, 0, 110, 0)");
  glow.addColorStop(1, colors.horizon);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = glow;
  ctx.fillRect(0, HORIZON_Y - 40, WORLD_W, 40);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = colors.horizon;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HORIZON_Y);
  ctx.lineTo(WORLD_W, HORIZON_Y);
  ctx.stroke();

  ctx.strokeStyle = colors.grid;
  const depth = WORLD_H - HORIZON_Y;
  // Progresión cuadrática: las filas se apelotonan al acercarse al horizonte.
  for (let i = 1; i <= GRID_ROWS; i++) {
    const t = i / GRID_ROWS;
    const y = HORIZON_Y + depth * t * t;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
    ctx.stroke();
  }
  // Líneas de fuga: todas salen del centro del horizonte y abren hacia abajo.
  for (let i = 0; i <= GRID_COLS; i++) {
    const x = (i / GRID_COLS) * WORLD_W;
    ctx.beginPath();
    ctx.moveTo(WORLD_W / 2, HORIZON_Y);
    ctx.lineTo(WORLD_W / 2 + (x - WORLD_W / 2) * 3, WORLD_H);
    ctx.stroke();
  }
}

/** Ninguna bandera pulsada: el estado inicial y el de limpieza. */
const idleInput = (): Input => ({
  left: false,
  right: false,
  thrust: false,
  fire: false,
});

export function AsteroidsGame({
  paused,
  onTogglePause,
  onRun,
  onOver,
}: AsteroidsGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // El estado del motor vive en un ref: a 60 fps un setState por fotograma
  // reconciliaría React para pintar en un lienzo que React no gestiona.
  const stateRef = useRef<AsteroidsState | null>(null);
  if (stateRef.current === null) stateRef.current = createState();

  // Teclado y mandos escriben en el mismo objeto: el motor no sabe de dónde
  // viene cada bandera.
  const inputRef = useRef<Input>(idleInput());
  const paletteRef = useRef<Palette>(ROCK_FALLBACK);
  const lastRunRef = useRef<AsteroidsRun | null>(null);

  // Callbacks en refs para que el bucle no se reinicie cuando el padre repinta.
  const onRunRef = useRef(onRun);
  const onOverRef = useRef(onOver);
  const onTogglePauseRef = useRef(onTogglePause);
  useEffect(() => {
    onRunRef.current = onRun;
    onOverRef.current = onOver;
    onTogglePauseRef.current = onTogglePause;
  }, [onRun, onOver, onTogglePause]);

  /** Prepara el lienzo al tamaño lógico, escalado por devicePixelRatio. */
  const context2d = useCallback((canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(WORLD_W * dpr)) {
      canvas.width = Math.round(WORLD_W * dpr);
      canvas.height = Math.round(WORLD_H * dpr);
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

    drawBackdrop(ctx, colors);

    // Partículas: trazos blancos que se desvanecen con su vida.
    ctx.lineWidth = 1;
    for (const p of state.particles) {
      ctx.strokeStyle = `rgba(255,255,255,${(p.ttl / p.life).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.stroke();
    }

    // Rocas: polígonos en trazo, sin relleno, como la referencia.
    ctx.strokeStyle = colors.rock;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    for (const r of state.rocks) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.rot);
      ctx.beginPath();
      ctx.moveTo(r.verts[0][0], r.verts[0][1]);
      for (let i = 1; i < r.verts.length; i++) {
        ctx.lineTo(r.verts[i][0], r.verts[i][1]);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Objetos: rombo con su inicial, parpadeando los dos últimos segundos.
    for (const d of state.drops) {
      if (d.ttl < 2 && Math.floor(d.ttl * 8) % 2 === 0) continue;
      const color = d.kind === "triple" ? colors.triple : colors.shield;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        -DROP_RADIUS,
        -DROP_RADIUS,
        DROP_RADIUS * 2,
        DROP_RADIUS * 2,
      );
      ctx.restore();
      ctx.fillStyle = color;
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(d.kind === "triple" ? "3x" : "◎", d.x, d.y);
    }

    // Balas.
    ctx.fillStyle = colors.bullet;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nave: parpadea mientras es invulnerable, para que se note.
    const { ship } = state;
    const blinking =
      ship.invincible > 0 && Math.floor(ship.invincible * 8) % 2 === 0;
    if (!state.over && !blinking) {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.angle);
      ctx.strokeStyle = colors.ship;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      // Silueta clásica: triángulo con muesca trasera.
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-12, -9);
      ctx.lineTo(-7, 0);
      ctx.lineTo(-12, 9);
      ctx.closePath();
      ctx.stroke();
      // Llama del propulsor, parpadeando como en la referencia.
      if (ship.thrusting && Math.random() > 0.35) {
        ctx.beginPath();
        ctx.moveTo(-8, -4);
        ctx.lineTo(-8 - (6 + Math.random() * 8), 0);
        ctx.lineTo(-8, 4);
        ctx.strokeStyle = colors.flame;
        ctx.stroke();
      }
      ctx.restore();

      // Burbuja del escudo: un círculo que respira alrededor de la nave.
      if (ship.shield > 0) {
        ctx.save();
        ctx.globalAlpha =
          ship.shield < 2 && Math.floor(ship.shield * 6) % 2 === 0 ? 0.25 : 0.7;
        ctx.strokeStyle = colors.shield;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, RADII[1] + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Lo único que se dibuja del estado del jugador: la cuenta atrás del efecto
    // activo. Puntuación, vidas y nivel son del HUD común.
    const effect =
      ship.triple > 0
        ? { label: "3x", left: ship.triple, color: colors.triple }
        : ship.shield > 0
          ? { label: "ESCUDO", left: ship.shield, color: colors.shield }
          : null;
    if (effect) {
      ctx.fillStyle = effect.color;
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(
        `${effect.label} ${effect.left.toFixed(1)}S`,
        14,
        14,
      );
    }
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
    const palette = { ...ROCK_FALLBACK };
    for (const key of Object.keys(ROCK_VARS) as (keyof Palette)[]) {
      const value = root.getPropertyValue(ROCK_VARS[key]).trim();
      if (value) palette[key] = value;
    }
    paletteRef.current = palette;
    draw();
    publish();
  }, [draw, publish]);

  // Bucle del juego: `dt` real en segundos, no un acumulador de intervalos.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    draw();
    if (paused || state.over) return;

    let raf = 0;
    let last = performance.now();

    const loop = (ts: number) => {
      const dt = Math.min((ts - last) / 1000, MAX_DT);
      last = ts;
      step(state, inputRef.current, dt);
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

  // Pausar o desmontar no puede dejar un giro pegado.
  useEffect(() => {
    if (!paused) return;
    inputRef.current = idleInput();
  }, [paused]);
  useEffect(() => () => void (inputRef.current = idleInput()), []);

  // Teclado. Todas las teclas del juego cancelan su efecto por defecto, para
  // que Space no desplace la página.
  useEffect(() => {
    const flagFor = (code: string): keyof Input | null => {
      switch (code) {
        case "ArrowLeft":
          return "left";
        case "ArrowRight":
          return "right";
        case "ArrowUp":
          return "thrust";
        case "Space":
          return "fire";
        default:
          return null;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyP") {
        event.preventDefault();
        onTogglePauseRef.current();
        return;
      }
      const flag = flagFor(event.code);
      if (!flag) return;
      event.preventDefault();
      const state = stateRef.current;
      if (!state || paused || state.over) return;
      inputRef.current[flag] = true;
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const flag = flagFor(event.code);
      if (!flag) return;
      event.preventDefault();
      inputRef.current[flag] = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [paused]);

  /** Marca o borra una bandera de entrada desde un mando de pantalla. */
  const setFlag = useCallback(
    (flag: keyof Input, value: boolean) => {
      const state = stateRef.current;
      if (value && (!state || paused || state.over)) return;
      inputRef.current[flag] = value;
    },
    [paused],
  );

  /**
   * Mando de pantalla: marca la bandera al tocar y la borra al soltar. Sin
   * `setInterval` como la cruceta de TETRIX, porque aquí el motor ya lee un
   * estado mantenido en cada fotograma.
   */
  const padProps = (flag: keyof Input) => ({
    type: "button" as const,
    className: "btn",
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setFlag(flag, true);
    },
    onPointerUp: () => setFlag(flag, false),
    onPointerCancel: () => setFlag(flag, false),
    onPointerLeave: () => setFlag(flag, false),
  });

  return (
    <div className="rocks-stage">
      <canvas
        ref={canvasRef}
        className="rocks-field"
        width={WORLD_W}
        height={WORLD_H}
        role="img"
        aria-label="Campo de ASTEROIDES"
      />
      <div className="rocks-side">
        <div className="rocks-block">
          <span className="l">MOVIMIENTO</span>
          <div className="rocks-pad">
            <button
              {...padProps("thrust")}
              className="btn pad-thrust"
              aria-label="Empujar"
            >
              ▲
            </button>
            <button
              {...padProps("left")}
              className="btn pad-left"
              aria-label="Girar a la izquierda"
            >
              ◀
            </button>
            <button
              {...padProps("right")}
              className="btn pad-right"
              aria-label="Girar a la derecha"
            >
              ▶
            </button>
          </div>
        </div>
        <div className="rocks-block">
          <span className="l">DISPARO</span>
          <button
            {...padProps("fire")}
            className="btn magenta pad-fire"
            aria-label="Disparar"
          >
            ◉ FUEGO
          </button>
        </div>
        <div className="rocks-block rocks-objects">
          <span className="l">OBJETOS</span>
          <ul className="rocks-legend">
            <li>
              <span className="k triple">3x</span>
              <span className="d">TRIPLE</span>
            </li>
            <li>
              <span className="k shield">◎</span>
              <span className="d">ESCUDO</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
