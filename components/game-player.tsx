"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useSession } from "@/components/session-provider";
import { ArkanoidGame } from "@/components/arkanoid-game";
import { AsteroidsGame } from "@/components/asteroids-game";
import { TetrisGame } from "@/components/tetris-game";
import type { Game } from "@/lib/games";
import { LIVES as ARKANOID_LIVES } from "@/lib/arkanoid";
import { LIVES as ASTEROIDS_LIVES } from "@/lib/asteroids";
import { LIVES as TETRIX_LIVES } from "@/lib/tetris";
import { displayName } from "@/lib/supabase/user";

/**
 * Partida recuperada al volver de /auth. Viaja en la URL (`?puntuacion=`) y la
 * resuelve el servidor, así que no hace falta ni sessionStorage ni un efecto
 * que la rescate después de hidratar. Nada de esto se persiste.
 */
export type RestoredRun = { score: number; level: number };

const LIVES = 3;
const TICK_MS = 220;

/** Los tres números que un motor empuja al HUD. */
export type EngineRun = { score: number; lives: number; level: number };

/**
 * El contrato de un motor real. No pinta HUD, no tiene pausa propia y no sabe
 * quién juega: sólo empuja números por `onRun` y avisa del final con `onOver`.
 */
export type EngineProps = {
  paused: boolean;
  onTogglePause: () => void;
  onRun: (run: EngineRun) => void;
  onOver: () => void;
};

/**
 * Los juegos con motor real. `lives` es con cuántas vidas arranca el HUD y
 * `screen` el modificador que se añade a `.crt-screen` —vacío cuando el motor
 * ya encaja en el 4 / 3 del tubo. Un id que no esté aquí sigue con la escena
 * decorativa.
 */
const ENGINES: Record<
  string,
  { Component: ComponentType<EngineProps>; lives: number; screen: string }
> = {
  tetrix: { Component: TetrisGame, lives: TETRIX_LIVES, screen: "tetris" },
  asteroides: {
    Component: AsteroidsGame,
    lives: ASTEROIDS_LIVES,
    screen: "rocks",
  },
  arkanoid: { Component: ArkanoidGame, lives: ARKANOID_LIVES, screen: "" },
};

type Run = EngineRun;

const NEW_RUN: Run = { score: 0, lives: LIVES, level: 1 };

export function GamePlayer({
  game,
  restored,
}: {
  game: Game;
  restored?: RestoredRun;
}) {
  const { user } = useSession();
  const engine = ENGINES[game.id];
  const initialRun: Run = engine
    ? { score: 0, lives: engine.lives, level: 1 }
    : NEW_RUN;

  // /jugar/[id] está detrás del proxy, así que aquí siempre hay sesión: la
  // rama sin usuario sólo existe porque useSession() la admite en el tipo.
  // El nombre no se edita: es el de la sesión y nada más.
  const name = user ? displayName(user) : "INVITADO";
  const isGuest = user?.isGuest ?? true;
  // Partida que vuelve de /auth con una sesión de verdad detrás.
  const recuperada = restored !== undefined && !isGuest;

  const [run, setRun] = useState<Run>(
    recuperada ? { ...initialRun, ...restored, lives: 0 } : initialRun,
  );
  const [paused, setPaused] = useState(false);
  // Volver de /auth con una partida recuperada reabre su modal de fin.
  const [over, setOver] = useState(recuperada);
  // Y la da por guardada: es justo lo que el jugador fue a hacer a /auth.
  const [saved, setSaved] = useState(recuperada);
  // Cambiar la key remonta el motor: es todo el reinicio que hace falta.
  const [runKey, setRunKey] = useState(0);
  const pathname = usePathname();
  const router = useRouter();

  /** Lleva la partida a /auth, que devuelve a este mismo juego con ella. */
  const goSignIn = () => {
    const vuelta = `${pathname}?puntuacion=${run.score}&nivel=${run.level}`;
    router.push(`/auth?next=${encodeURIComponent(vuelta)}`);
  };

  useEffect(() => {
    if (engine || over || paused) return;
    const timer = setInterval(() => {
      setRun((prev) => {
        const score = prev.score + Math.floor(10 + Math.random() * 90);
        // Misma regla que el template: un nivel por cada 2500 puntos.
        const level =
          score > 0 && score % 2500 < 100 ? prev.level + 1 : prev.level;
        return { ...prev, score, level };
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [engine, over, paused]);

  // Con una partida recuperada el motor se monta de cero detrás del modal y su
  // primer aviso (0 puntos) pisaría la puntuación que se acaba de recuperar.
  // Se le ignora hasta que el jugador arranca una partida nueva.
  const ignoreRun = useRef(recuperada);

  const togglePause = useCallback(() => setPaused((p) => !p), []);
  const handleRun = useCallback((next: EngineRun) => {
    if (ignoreRun.current) return;
    setRun(next);
  }, []);
  const handleOver = useCallback(() => setOver(true), []);

  const restart = () => {
    ignoreRun.current = false;
    setRun(initialRun);
    setPaused(false);
    setOver(false);
    setSaved(false);
    setRunKey((k) => k + 1);
    // Sin esto, recargar volvería a abrir el modal con la partida de la URL.
    if (restored) router.replace(pathname, { scroll: false });
  };

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: "var(--ink)" }}>
              {name}
            </div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{run.score.toLocaleString("es-ES")}</div>
          </div>
          <div className="hud-stat lives">
            <div className="l">Vidas</div>
            <div className="v">{"♥ ".repeat(run.lives).trim() || "—"}</div>
          </div>
          <div className="hud-stat level">
            <div className="l">Nivel</div>
            <div className="v">{String(run.level).padStart(2, "0")}</div>
          </div>
        </div>
        <div className="hud-actions">
          <button className="btn yellow" onClick={togglePause}>
            {paused ? "REANUDAR" : "PAUSA"}
          </button>
          <button className="btn magenta" onClick={() => setOver(true)}>
            FIN
          </button>
          <Link className="btn ghost" href={`/juego/${game.id}`}>
            SALIR
          </Link>
        </div>
      </div>

      <div className="crt">
        <div className={"crt-screen" + (engine?.screen ? " " + engine.screen : "")}>
          {engine ? (
            <engine.Component
              key={runKey}
              /* FIN también congela el motor: el bucle no sigue tras el modal. */
              paused={paused || over}
              onTogglePause={togglePause}
              onRun={handleRun}
              onOver={handleOver}
            />
          ) : (
            <div className="game-arena" aria-hidden>
              <div className="grid-floor" />
              <div className="enemy e1" />
              <div className="enemy e2" />
              <div className="enemy e3" />
              <div className="player-ship" />
            </div>
          )}
          {paused && (
            <div
              className="crt-content"
              style={{ background: "rgba(0,0,0,0.6)", zIndex: 5 }}
            >
              <div>
                <div className="pixel neon-yellow" style={{ fontSize: 22 }}>
                  EN PAUSA
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: "var(--ink-dim)",
                    marginTop: 10,
                    letterSpacing: "0.16em",
                  }}
                >
                  PULSA REANUDAR PARA CONTINUAR
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>{game.title} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>

      {over && (
        <div className="modal-bd">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="av-game-over"
          >
            <h2 id="av-game-over">FIN DEL JUEGO</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{run.score.toLocaleString("es-ES")}</div>
            <div className="modal-player">
              <span className="l">Jugador</span>
              <span className="v">{name}</span>
            </div>
            {saved ? (
              <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
            ) : isGuest ? (
              <div className="guest-save">
                <p>
                  Estás jugando como invitado. Inicia sesión con Google, GitHub
                  o tu correo para guardar esta puntuación.
                </p>
                <button className="btn yellow" onClick={goSignIn}>
                  INICIAR SESIÓN PARA GUARDAR
                </button>
              </div>
            ) : (
              /* Decorativo: no se persiste ninguna puntuación. */
              <div className="input-row">
                <button className="btn yellow" onClick={() => setSaved(true)}>
                  GUARDAR PUNTUACIÓN
                </button>
              </div>
            )}
            <div className="actions">
              <button className="btn" onClick={restart}>
                JUGAR DE NUEVO
              </button>
              <Link className="btn magenta" href="/biblioteca">
                VOLVER AL VAULT
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
