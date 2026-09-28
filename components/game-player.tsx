"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import { useSession } from "@/components/session-provider";
import { ArkanoidGame } from "@/components/arkanoid-game";
import { AsteroidsGame } from "@/components/asteroids-game";
import { BuscaminasGame } from "@/components/buscaminas-game";
import { TetrisGame } from "@/components/tetris-game";
import type { Game } from "@/lib/supabase/games";
import { displayName } from "@/lib/supabase/user";
import { createClient } from "@/lib/supabase/client";

/**
 * Partida recuperada al volver de /auth. Viaja en la URL (`?puntuacion=`) y la
 * resuelve el servidor, así que no hace falta ni sessionStorage ni un efecto
 * que la rescate después de hidratar. Nada de esto se persiste.
 */
export type RestoredRun = { score: number; level: number };

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
  /** Vidas iniciales reales, de `games.vidas` (SPEC 18). */
  initialLives: number;
  /** Tope de nivel real, de `games.niveles`; null = sin tope. Solo TETRIX lo usa. */
  maxLevel: number | null;
};

/**
 * Los cuatro juegos del catálogo, todos con motor real. `screen` es el
 * modificador que se añade a `.crt-screen` —vacío cuando el motor ya encaja
 * en el 4 / 3 del tubo. Las vidas y el tope de nivel ya no viven aquí: cada
 * uno llega de `game.vidas`/`game.niveles` (SPEC 18).
 */
const ENGINES: Record<
  string,
  { Component: ComponentType<EngineProps>; screen: string }
> = {
  tetrix: { Component: TetrisGame, screen: "tetris" },
  asteroides: { Component: AsteroidsGame, screen: "rocks" },
  arkanoid: { Component: ArkanoidGame, screen: "" },
  buscaminas: { Component: BuscaminasGame, screen: "minas" },
};

type Run = EngineRun;

export function GamePlayer({
  game,
  restored,
  initialBest = null,
}: {
  game: Game;
  restored?: RestoredRun;
  /** Mejor marca real del usuario para este juego, si hay sesión no invitada. */
  initialBest?: number | null;
}) {
  const { user } = useSession();
  const engine = ENGINES[game.id];
  const initialRun: Run = { score: 0, lives: game.vidas, level: 1 };

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
  // Ya no se da por guardada sin más: el guardado real depende de si es récord.
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // Mejor marca conocida del jugador para este juego; se sincroniza con la
  // respuesta del servidor en cada guardado, sea récord o no.
  const [bestScore, setBestScore] = useState<number | null>(
    initialBest ?? null,
  );
  // Se fija junto con `saved`, solo para el copy "(ANTES …)".
  const [previousBestAtSave, setPreviousBestAtSave] = useState<number | null>(
    null,
  );
  const isRecord = bestScore === null || run.score > bestScore;
  // Cambiar la key remonta el motor: es todo el reinicio que hace falta.
  const [runKey, setRunKey] = useState(0);
  const pathname = usePathname();
  const router = useRouter();

  // Pantalla completa real, solo botón visible en móvil (SPEC 19). El ref
  // apunta al contenedor entero (HUD + CRT + pie), no solo al canvas: la
  // Fullscreen API oculta el resto de la página (nav, footer) sola.
  const playerRef = useRef<HTMLDivElement>(null);
  // El servidor nunca tiene `document`: useSyncExternalStore es lo que evita
  // que ese hueco produzca un desajuste de hidratación (getServerSnapshot
  // devuelve el valor "sin soporte" que el HTML del servidor ya pintó).
  const supportsFullscreen = useSyncExternalStore(
    () => () => {},
    () => Boolean(document.documentElement.requestFullscreen),
    () => false,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Cubre cualquier salida que no pase por el propio botón (Esc, gesto atrás
  // de Android, etc.) y cierra la pantalla completa si el reproductor se
  // desmonta (SALIR / VOLVER AL VAULT) mientras seguía activa.
  useEffect(() => {
    const el = playerRef.current;
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === el);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement === el) {
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!playerRef.current) return;
    if (document.fullscreenElement === playerRef.current) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void playerRef.current.requestFullscreen().catch(() => {});
    }
  }, []);

  /** Lleva la partida a /auth, que devuelve a este mismo juego con ella. */
  const goSignIn = () => {
    const vuelta = `${pathname}?puntuacion=${run.score}&nivel=${run.level}`;
    router.push(`/auth?next=${encodeURIComponent(vuelta)}`);
  };

  // Una partida empezada cuenta como jugada, se termine o no. rpc() devuelve
  // un builder "thenable": sin then/await el fetch nunca sale.
  useEffect(() => {
    const supabase = createClient();
    void supabase.rpc("increment_game_plays", { p_slug: game.id }).then();
  }, [game.id]);

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

  /**
   * Guarda de verdad la partida actual. Solo se llama cuando `isRecord` ya es
   * cierto (el botón no aparece si no lo es): el servidor vuelve a comprobarlo
   * igualmente y nunca confía en ese estado del cliente.
   */
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(false);
    const supabase = createClient();
    const { data, error } = await supabase
      .rpc("save_score", {
        p_slug: game.id,
        p_score: run.score,
        p_level: run.level,
      })
      .single();
    setSaving(false);
    if (error || !data) {
      setSaveError(true);
      return;
    }
    if (data.is_new_record) {
      setBestScore(run.score);
      setPreviousBestAtSave(data.previous_best);
      setSaved(true);
    } else {
      // Carrera perdida (otra pestaña guardó mientras tanto): la marca real
      // manda, y el siguiente render ya pinta solo la rama de "no es récord".
      setBestScore(data.previous_best);
    }
  }, [game.id, run.score, run.level]);

  // La partida recuperada de /auth se autoguarda si es récord; si no lo es,
  // el modal ya pinta esa rama sola con el `bestScore` inicial, sin llamar
  // al servidor. Se difiere con setTimeout(0): handleSave actualiza estado en
  // su primera línea (antes del primer await), y llamarlo en línea dentro del
  // efecto dispararía ese setState de forma síncrona durante el propio efecto.
  useEffect(() => {
    if (!(recuperada && !isGuest && !saved && !saving && isRecord)) return;
    const id = setTimeout(() => void handleSave(), 0);
    return () => clearTimeout(id);
  }, [recuperada, isGuest, saved, saving, isRecord, handleSave]);

  const restart = () => {
    ignoreRun.current = false;
    setRun(initialRun);
    setPaused(false);
    setOver(false);
    setSaved(false);
    setSaving(false);
    setSaveError(false);
    setPreviousBestAtSave(null);
    setRunKey((k) => k + 1);
    // Sin esto, recargar volvería a abrir el modal con la partida de la URL.
    if (restored) router.replace(pathname, { scroll: false });
  };

  return (
    <div className="av-player fade-in" ref={playerRef}>
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
        <div
          className={"crt-screen" + (engine.screen ? " " + engine.screen : "")}
        >
          <engine.Component
            key={runKey}
            /* FIN también congela el motor: el bucle no sigue tras el modal. */
            paused={paused || over}
            onTogglePause={togglePause}
            onRun={handleRun}
            onOver={handleOver}
            initialLives={game.vidas}
            maxLevel={game.niveles}
          />
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
        {supportsFullscreen && (
          <button
            className="btn ghost fullscreen-toggle"
            onClick={toggleFullscreen}
            aria-label={
              isFullscreen
                ? "Salir de pantalla completa"
                : "Activar pantalla completa"
            }
            aria-pressed={isFullscreen}
          >
            ⛶
          </button>
        )}
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
              <div className="toast-saved">
                ▸ ¡NUEVA MARCA PERSONAL! {run.score.toLocaleString("es-ES")}
                {previousBestAtSave !== null &&
                  ` (ANTES ${previousBestAtSave.toLocaleString("es-ES")})`}
                _
              </div>
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
            ) : isRecord ? (
              <>
                <div className="input-row">
                  <button
                    className="btn yellow"
                    onClick={() => void handleSave()}
                    disabled={saving}
                  >
                    {saving ? "GUARDANDO…" : "GUARDAR PUNTUACIÓN"}
                  </button>
                </div>
                {saveError && !saving && (
                  <div className="save-error">NO SE PUDO GUARDAR_</div>
                )}
              </>
            ) : (
              <div className="no-record">
                TU MEJOR MARCA EN {game.title} SIGUE SIENDO{" "}
                {bestScore?.toLocaleString("es-ES")}
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
