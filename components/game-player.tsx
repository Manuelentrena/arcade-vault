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
  type Ref,
} from "react";
import { useSession } from "@/components/session-provider";
import { ArkanoidGame } from "@/components/arkanoid-game";
import { AsteroidsGame } from "@/components/asteroids-game";
import { BuscaminasGame } from "@/components/buscaminas-game";
import { GamePad } from "@/components/game-pad";
import { SerpienteGame } from "@/components/serpiente-game";
import { TetrisGame } from "@/components/tetris-game";
import type { Game } from "@/lib/supabase/games";
import type { GameSession, ReplayProof } from "@/lib/supabase/scores";
import { displayName } from "@/lib/supabase/user";
import { createClient } from "@/lib/supabase/client";
import type { TetrixActionLog } from "@/lib/tetris-replay";
import type { SerpienteActionLog } from "@/lib/serpiente-replay";
import type { BuscaminasActionLog } from "@/lib/buscaminas-replay";

/**
 * Partida recuperada al volver de /auth. Viaja en la URL (`?puntuacion=`) y la
 * resuelve el servidor, así que no hace falta ni sessionStorage ni un efecto
 * que la rescate después de hidratar. Nada de esto se persiste.
 */
export type RestoredRun = { score: number; level: number };

/** Los tres números que un motor empuja al HUD. */
export type EngineRun = { score: number; lives: number; level: number };

/**
 * Las seis entradas físicas del mando de móvil (SPEC 21). Nada más: si un
 * juego necesita una séptima, el mando deja de ser común y eso es otra spec.
 */
export type PadAction = "up" | "down" | "left" | "right" | "a" | "b";

/**
 * Lo que un motor expone hacia arriba para que el mando lo pulse. Mismo
 * camino que un teclado: pulsar y soltar, nunca "hacer la acción".
 */
export type PadHandle = {
  press: (action: PadAction) => void;
  release: (action: PadAction) => void;
};

/**
 * El esquema de un juego. Declarativo y estático: vive en ENGINES, no en el
 * motor, para que los cuatro esquemas se lean de un vistazo. Son solo nombres:
 * ninguna tecla del mando pinta nada en su cara, así que aquí no hay glifos —
 * cada entrada es el `aria-label` de su tecla y nada más.
 */
export type PadLayout = {
  /** aria-label por dirección activa; la que falte se pinta apagada e inerte. */
  dpad: Partial<Record<"up" | "down" | "left" | "right", string>>;
  /** Los dos botones de acción, en orden A y B; `null` = presente pero inerte. */
  buttons: [string | null, string | null];
};

/**
 * El contrato de un motor real. No pinta HUD, no tiene pausa propia y no sabe
 * quién juega: sólo empuja números por `onRun` y avisa del final con `onOver`.
 */
export type EngineProps = {
  paused: boolean;
  onTogglePause: () => void;
  onRun: (run: EngineRun) => void;
  /**
   * El `log` es el registro de acciones de la partida (SPEC 32, SPEC 33);
   * solo los motores con `games.requiere_replay` lo mandan, para que el
   * reproductor pueda pedir el replay en servidor antes de guardar.
   */
  onOver: (
    log?: TetrixActionLog | SerpienteActionLog | BuscaminasActionLog,
  ) => void;
  /** Vidas iniciales reales, de `games.vidas` (SPEC 18). */
  initialLives: number;
  /** Tope de nivel real, de `games.niveles`; null = sin tope. Solo TETRIX lo usa. */
  maxLevel: number | null;
  /** El motor publica aquí su PadHandle; el mando de móvil lo pulsa (SPEC 21). */
  padRef: Ref<PadHandle>;
  /** Semilla de `start_game_session` (SPEC 32); cadena vacía si no hay sesión. Solo TETRIX y SERPIENTE la usan. */
  seed: string;
};

/**
 * Los cuatro juegos del catálogo, todos con motor real. `screen` es el
 * modificador que se añade a `.crt-screen` —vacío cuando el motor ya encaja
 * en el 4 / 3 del tubo. Las vidas y el tope de nivel ya no viven aquí: cada
 * uno llega de `game.vidas`/`game.niveles` (SPEC 18). `pad` es el esquema del
 * mando de móvil (SPEC 21): lo que un juego no usa se pinta apagado e inerte,
 * así que la silueta es la misma en los cuatro.
 */
const ENGINES: Record<
  string,
  { Component: ComponentType<EngineProps>; screen: string; pad: PadLayout }
> = {
  tetrix: {
    Component: TetrisGame,
    screen: "tetris",
    pad: {
      dpad: {
        up: "Rotar la pieza",
        down: "Bajar más rápido",
        left: "Mover a la izquierda",
        right: "Mover a la derecha",
      },
      buttons: ["Caída instantánea", "Rotar la pieza"],
    },
  },
  asteroides: {
    Component: AsteroidsGame,
    screen: "rocks",
    pad: {
      dpad: {
        up: "Empujar",
        left: "Girar a la izquierda",
        right: "Girar a la derecha",
      },
      buttons: ["Disparar", null],
    },
  },
  arkanoid: {
    Component: ArkanoidGame,
    screen: "",
    pad: {
      dpad: {
        left: "Mover la pala a la izquierda",
        right: "Mover la pala a la derecha",
      },
      buttons: ["Lanzar la bola", null],
    },
  },
  buscaminas: {
    Component: BuscaminasGame,
    screen: "minas",
    pad: {
      dpad: {
        up: "Mover el cursor arriba",
        down: "Mover el cursor abajo",
        left: "Mover el cursor a la izquierda",
        right: "Mover el cursor a la derecha",
      },
      buttons: ["Revelar la celda", "Marcar con bandera"],
    },
  },
  // SERPIENTE (SPEC 25). `screen` vacío como ARKANOID: su tablero ya es el
  // 4 / 3 del tubo y, desde la SPEC 21, no queda ninguna regla
  // `.crt-screen.<modificador>` que un valor nuevo pudiera enganchar.
  //
  // Los dos círculos giran 90° **relativo** al rumbo en vez de quedar inertes:
  // mismo argumento con el que la SPEC 23 revivió la B de TETRIX, y SERPIENTE
  // habría sido el primer juego con los dos muertos. Que «Girar a la derecha»
  // aparezca en el dpad y en los botones es correcto: son aria-labels, dicen
  // el efecto, y una flecha y un círculo pueden llevar al mismo sitio por
  // caminos distintos — absoluto el de la cruceta, relativo el del círculo.
  serpiente: {
    Component: SerpienteGame,
    screen: "",
    pad: {
      dpad: {
        up: "Girar hacia arriba",
        down: "Girar hacia abajo",
        left: "Girar a la izquierda",
        right: "Girar a la derecha",
      },
      buttons: ["Girar a la derecha", "Girar a la izquierda"],
    },
  },
};

type Run = EngineRun;

export function GamePlayer({
  game,
  restored,
  initialBest = null,
  gameSession = null,
}: {
  game: Game;
  restored?: RestoredRun;
  /** Mejor marca real del usuario para este juego, si hay sesión no invitada. */
  initialBest?: number | null;
  /** Token de sesión de partida (SPEC 29); `null` si `start_game_session` falló. */
  gameSession?: GameSession | null;
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
  // Volver de /auth con una partida recuperada reabre su panel de fin.
  const [over, setOver] = useState(recuperada);
  // El panel del tubo tiene dos estados y un solo dibujo (SPEC 22): `menu` es
  // el reanudable, `over` el de fin de partida. `over` manda: si es cierto, da
  // igual cómo estuviera `menu`, el panel es el del final.
  const [menu, setMenu] = useState(false);
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

  // El motor publica aquí su PadHandle y el mando de móvil lo pulsa (SPEC 21).
  // Al remontar el motor (`runKey`) React reasigna el ref solo.
  const padRef = useRef<PadHandle | null>(null);

  // Registro de acciones de la última partida (SPEC 32, SPEC 33); solo
  // `handleOver` lo escribe y solo `handleSave` lo lee, así que un ref basta
  // — no necesita disparar un repintado.
  const actionLogRef = useRef<
    TetrixActionLog | SerpienteActionLog | BuscaminasActionLog | null
  >(null);

  // El panel del tubo y el botón que lo abrió. El botón no se guarda por `ref`
  // porque son dos —el del HUD y la pastilla del mando— y solo uno de los dos
  // se ve en cada viewport: se anota el que tenía el foco al abrir.
  const menuRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const panelOpen = menu || over;

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

  /**
   * El botón MENÚ es un interruptor: abre el panel y, pulsado otra vez, lo
   * cierra y devuelve la partida. Por eso el panel no tiene CONTINUAR — el
   * camino de vuelta es el mismo botón, en los dos viewports.
   *
   * Quita la pausa a propósito al abrir: el panel ya congela el motor, y
   * dejarla puesta pintaría el cartel de EN PAUSA debajo.
   */
  const toggleMenu = useCallback(() => {
    setMenu((open) => {
      if (open) return false;
      openerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setPaused(false);
      return true;
    });
  }, []);
  /** Solo cierra el estado menú; el de fin de partida no se cierra nunca. */
  const closeMenu = useCallback(() => setMenu(false), []);

  const handleRun = useCallback((next: EngineRun) => {
    if (ignoreRun.current) return;
    setRun(next);
  }, []);
  const handleOver = useCallback(
    (log?: TetrixActionLog | SerpienteActionLog | BuscaminasActionLog) => {
      actionLogRef.current = log ?? null;
      setOver(true);
    },
    [],
  );

  /**
   * Manda el registro de acciones de la partida a la ruta de validación del
   * motor para que el servidor la reproduzca (SPEC 32, SPEC 33). Vive aquí y
   * no en `lib/supabase/scores.ts` porque ese módulo importa `@/lib/supabase/
   * server` (usa `next/headers`), que no puede entrar en el bundle del
   * cliente.
   */
  const validarPartida = useCallback(
    async (
      slug: string,
      token: string,
      log: TetrixActionLog | SerpienteActionLog | BuscaminasActionLog,
    ): Promise<ReplayProof | null> => {
      try {
        const res = await fetch(`/api/validar-partida-${slug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, token, log }),
        });
        if (!res.ok) return null;
        return (await res.json()) as ReplayProof;
      } catch {
        return null;
      }
    },
    [],
  );

  /**
   * Guarda de verdad la partida actual. Solo se llama cuando `isRecord` ya es
   * cierto (el botón no aparece si no lo es): el servidor vuelve a comprobarlo
   * igualmente y nunca confía en ese estado del cliente.
   */
  const handleSave = useCallback(async () => {
    // Sin token no hay nada que enviar: el servidor lo rechazaría igual, pero
    // aquí se trata como el mismo fallo de red/servidor de siempre, no como
    // "no es récord" (que sí reflejaría una marca real).
    if (!gameSession) {
      setSaveError(true);
      return;
    }
    setSaving(true);
    setSaveError(false);

    // Un motor con requiere_replay no manda su propio score/nivel: el
    // replay en servidor es quien decide qué se guarda. Sin un registro
    // válido no hay nada que intentar.
    let proof: string | undefined;
    let score = run.score;
    let level = run.level;
    if (game.requiereReplay) {
      const replay = actionLogRef.current
        ? await validarPartida(game.id, gameSession.token, actionLogRef.current)
        : null;
      if (!replay) {
        setSaving(false);
        setSaveError(true);
        return;
      }
      score = replay.score;
      level = replay.level;
      proof = replay.proof;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .rpc("save_score", {
        p_slug: game.id,
        p_score: score,
        p_level: level,
        p_token: gameSession.token,
        p_proof: proof,
      })
      .single();
    setSaving(false);
    if (error || !data) {
      setSaveError(true);
      return;
    }
    if (data.is_new_record) {
      setBestScore(score);
      setPreviousBestAtSave(data.previous_best);
      setSaved(true);
    } else {
      // Carrera perdida (otra pestaña guardó mientras tanto): la marca real
      // manda, y el siguiente render ya pinta solo la rama de "no es récord".
      setBestScore(data.previous_best);
    }
  }, [
    game.id,
    game.requiereReplay,
    run.score,
    run.level,
    gameSession,
    validarPartida,
  ]);

  // La partida recuperada de /auth se autoguarda si es récord; si no lo es,
  // el modal ya pinta esa rama sola con el `bestScore` inicial, sin llamar
  // al servidor. Se difiere con setTimeout(0): handleSave actualiza estado en
  // su primera línea (antes del primer await), y llamarlo en línea dentro del
  // efecto dispararía ese setState de forma síncrona durante el propio efecto.
  //
  // `autoSaveAttempted` es lo que de verdad para el efecto. `saved` solo pasa
  // a `true` cuando el servidor confirma récord: un rechazo silencioso
  // (token/techo/nivel, o antes nunca, una carrera perdida con
  // `previous_best` todavía en null) deja `bestScore` en null o por debajo de
  // `run.score`, así que `isRecord` sigue en true y, sin esta marca, el
  // efecto reintentaría sin parar.
  const autoSaveAttempted = useRef(false);
  useEffect(() => {
    if (!(recuperada && !isGuest && !saved && !saving && isRecord)) return;
    if (autoSaveAttempted.current) return;
    autoSaveAttempted.current = true;
    const id = setTimeout(() => void handleSave(), 0);
    return () => clearTimeout(id);
  }, [recuperada, isGuest, saved, saving, isRecord, handleSave]);

  // El foco entra en la primera opción al abrir el panel y vuelve al botón que
  // lo abrió al cerrarlo. Con `over` no hay opener anotado (lo abre el motor),
  // así que al reiniciar el foco simplemente no se mueve.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (panelOpen && !wasOpen.current) {
      menuRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    } else if (!panelOpen && wasOpen.current) {
      openerRef.current?.focus();
      openerRef.current = null;
    }
    wasOpen.current = panelOpen;
  }, [panelOpen]);

  // Esc cierra el menú y nada más: el fin de partida no se descarta con una
  // tecla, porque debajo no hay partida a la que volver.
  useEffect(() => {
    if (!menu || over) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menu, over, closeMenu]);

  const restart = () => {
    ignoreRun.current = false;
    setRun(initialRun);
    setPaused(false);
    setOver(false);
    setMenu(false);
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
          <div className="hud-stat player">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: "var(--ink)" }}>
              {name}
            </div>
          </div>
          <div className="hud-stat score">
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
        {/* A ≤ 720px el CSS deja aquí solo ⛶ y SALIR: PAUSA y MENÚ bajan al
            mando (SPEC 21). El orden del DOM es el mismo en los dos viewports. */}
        <div className="hud-actions">
          {/* Los dos se excluyen: con el panel abierto no se puede pausar, y
              en pausa no se puede abrir el panel. El que no toca se queda
              gris y desactivado, para que se vea antes de pulsarlo. */}
          <button
            className="btn yellow hud-pause"
            onClick={togglePause}
            disabled={panelOpen}
          >
            {paused ? "REANUDAR" : "PAUSA"}
          </button>
          {/* La clase `hud-end` se conserva: es la que el CSS usa para
              ocultarlo en móvil. Lo que cambió es lo que hace el botón —abrir
              y cerrar un panel reanudable, no matar la partida (SPEC 22)—. */}
          <button
            className="btn magenta hud-end"
            onClick={toggleMenu}
            disabled={paused || over}
          >
            MENÚ
          </button>
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
        </div>
      </div>

      <div className="crt">
        <div
          className={"crt-screen" + (engine.screen ? " " + engine.screen : "")}
        >
          {/* Franja de señal, dentro del tubo y sobre el juego: el LED verde a
              la izquierda y el nombre del juego a la derecha. Solo se ve a
              ≤ 720px; en escritorio manda la `.crt-bottom` de debajo. La
              leyenda que va justo debajo la pinta cada motor, porque su
              contenido es estado del juego y solo el motor lo conoce. */}
          <div className="screen-signal">
            <span className="led">SEÑAL OK</span>
            <span className="screen-signal-title">{game.title}</span>
          </div>
          <engine.Component
            key={runKey}
            /* El panel del tubo también congela el motor, esté en estado menú
               o en fin de partida: el bucle no sigue detrás de él. */
            paused={paused || over || menu}
            onTogglePause={togglePause}
            onRun={handleRun}
            onOver={handleOver}
            initialLives={game.vidas}
            maxLevel={game.niveles}
            seed={gameSession?.seed ?? ""}
            padRef={padRef}
          />
          {/* Cuarta banda del tubo, debajo del juego y del mismo alto que la
              leyenda: los tres números del HUD, con sus mismos colores. En
              móvil son los únicos visibles —arriba solo queda el nombre— y
              por encima de 720px esta banda no existe (SPEC 21). */}
          <div className="screen-stats">
            <span className="screen-stat score">
              <span className="l">PTS</span>
              <span className="v">{run.score.toLocaleString("es-ES")}</span>
            </span>
            <span className="screen-stat lives">
              <span className="l">VIDAS</span>
              <span className="v">{"♥ ".repeat(run.lives).trim() || "—"}</span>
            </span>
            <span className="screen-stat level">
              <span className="l">NIVEL</span>
              <span className="v">{String(run.level).padStart(2, "0")}</span>
            </span>
          </div>
          {/* El panel del tubo (SPEC 22): un solo dibujo con dos estados. El
              menú es reanudable y no guarda nada; el fin de partida no tiene
              CONTINUAR y es el único que monta la rama de guardado. Vive
              dentro de `.crt-screen`, como el cartel de EN PAUSA, y por encima
              de él. */}
          {panelOpen && (
            <div
              className="crt-menu"
              ref={menuRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="av-crt-menu"
            >
              <h2 id="av-crt-menu">{over ? "FIN DEL JUEGO" : "MENÚ"}</h2>
              <div className="final-label">PUNTUACIÓN</div>
              <div className="final">{run.score.toLocaleString("es-ES")}</div>
              {/* Colgada de `over` a propósito: con la partida viva no hay
                  guardado de ninguna clase, ni botón, ni aviso, ni copia de
                  invitado. Se guarda al final, y una sola vez. */}
              {over && (
                <div className="crt-menu-save" aria-live="polite">
                  {saved ? (
                    <div className="toast-saved">
                      ▸ ¡NUEVA MARCA PERSONAL!{" "}
                      {run.score.toLocaleString("es-ES")}
                      {previousBestAtSave !== null &&
                        ` (ANTES ${previousBestAtSave.toLocaleString("es-ES")})`}
                      _
                    </div>
                  ) : isGuest ? (
                    <div className="guest-save">
                      <p>Inicia sesión para guardar esta puntuación.</p>
                      <button className="btn yellow" onClick={goSignIn}>
                        INICIAR SESIÓN PARA GUARDAR
                      </button>
                    </div>
                  ) : isRecord ? (
                    <>
                      <button
                        className="btn yellow"
                        onClick={() => void handleSave()}
                        disabled={saving}
                      >
                        {saving ? "GUARDANDO…" : "GUARDAR PUNTUACIÓN"}
                      </button>
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
                </div>
              )}
              {/* Sin CONTINUAR: se vuelve a la partida con el mismo botón
                  MENÚ que abrió el panel. `Esc` sigue siendo el atajo. */}
              <div className="crt-menu-actions">
                <button className="btn" onClick={restart}>
                  REINICIAR
                </button>
                <Link className="btn magenta" href="/biblioteca">
                  SALIR
                </Link>
              </div>
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
        {/* La de siempre, dentro de .crt: manda en escritorio y se oculta a
            ≤ 720px, donde su información sube a `.screen-signal`, dentro del
            tubo, y el mando cierra el mueble por abajo (SPEC 21). */}
        <div className="crt-bottom crt-bottom-desktop">
          <span className="led">SEÑAL OK</span>
          <span>{game.title} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>

      {/* Hermano de .crt y soldado a él: el mando es la parte baja del mismo
          mueble y lo cierra por abajo. Solo se ve a ≤ 720px; el CSS lo oculta
          por encima. */}
      <GamePad
        layout={engine.pad}
        handle={padRef}
        paused={paused}
        onTogglePause={togglePause}
        onMenu={toggleMenu}
        pauseDisabled={panelOpen}
        menuDisabled={paused || over}
      />
    </div>
  );
}
