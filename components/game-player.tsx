"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import type { Game } from "@/lib/games";
import { displayName } from "@/lib/supabase/user";

/** Mismo invariante que profiles.username: mayúsculas y máximo 10 caracteres. */
function normalizeName(name: string): string {
  return name.trim().toUpperCase().slice(0, 10);
}

const LIVES = 3;
const TICK_MS = 220;

type Run = { score: number; lives: number; level: number };

const NEW_RUN: Run = { score: 0, lives: LIVES, level: 1 };

export function GamePlayer({ game }: { game: Game }) {
  const { user } = useSession();
  const [run, setRun] = useState<Run>(NEW_RUN);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [saved, setSaved] = useState(false);
  // null = todavía no editado: se muestra el nombre de la sesión.
  const [editedName, setEditedName] = useState<string | null>(null);

  // /jugar/[id] está detrás del proxy, así que aquí siempre hay sesión: la
  // rama sin usuario sólo existe porque useSession() la admite en el tipo.
  const name = editedName ?? (user ? displayName(user) : "INVITADO");

  useEffect(() => {
    if (over || paused) return;
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
  }, [over, paused]);

  const restart = () => {
    setRun(NEW_RUN);
    setPaused(false);
    setOver(false);
    setSaved(false);
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
          <button className="btn yellow" onClick={() => setPaused((p) => !p)}>
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
        <div className="crt-screen">
          <div className="game-arena" aria-hidden>
            <div className="grid-floor" />
            <div className="enemy e1" />
            <div className="enemy e2" />
            <div className="enemy e3" />
            <div className="player-ship" />
          </div>
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
            {!saved ? (
              <div className="input-row">
                <input
                  value={name}
                  onChange={(e) => setEditedName(normalizeName(e.target.value))}
                  placeholder="TUS INICIALES"
                  aria-label="Tus iniciales"
                />
                {/* Decorativo: no se persiste ninguna puntuación. */}
                <button className="btn yellow" onClick={() => setSaved(true)}>
                  GUARDAR PUNTUACIÓN
                </button>
              </div>
            ) : (
              <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
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
