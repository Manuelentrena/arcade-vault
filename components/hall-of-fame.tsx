"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/components/session-provider";
import type { Game } from "@/lib/supabase/games";
import type { ScoreRow } from "@/lib/supabase/scores";

function medal(index: number): string {
  if (index === 0) return " top1";
  if (index === 1) return " top2";
  if (index === 2) return " top3";
  return "";
}

export type GameHallData = { rows: ScoreRow[]; userBest: number | null };

export function HallOfFame({
  games,
  data,
}: {
  games: Game[];
  data: Record<string, GameHallData>;
}) {
  const { user } = useSession();
  const [tab, setTab] = useState(games[0].id);

  const game = games.find((g) => g.id === tab)!;
  const { rows, userBest } = data[tab];

  return (
    <div className="av-hall fade-in">
      <div className="hall-head">
        <h1>SALÓN DE LA FAMA</h1>
        <p className="pixel" style={{ fontSize: 10 }}>
          LOS NOMBRES QUE NUNCA SE BORRAN DE LA PANTALLA
        </p>
      </div>

      <div className="hall-tabs">
        {games.map((g) => (
          <button
            key={g.id}
            className={"chip" + (tab === g.id ? " active" : "")}
            onClick={() => setTab(g.id)}
            aria-pressed={tab === g.id}
          >
            {g.title}
          </button>
        ))}
      </div>

      {rows.length >= 3 && (
        <div className="podium">
          <div className="podium-slot silver">
            <div className="rank-num">02</div>
            <div className="name">{rows[1].name}</div>
            <div className="score">{rows[1].score.toLocaleString("es-ES")}</div>
            <div className="date">{rows[1].date}</div>
          </div>
          <div className="podium-slot gold">
            <div
              className="pixel"
              style={{
                fontSize: 9,
                color: "var(--gold)",
                letterSpacing: "0.18em",
              }}
            >
              CAMPEÓN
            </div>
            <div className="rank-num" style={{ fontSize: 36, marginTop: 4 }}>
              01
            </div>
            <div className="name">{rows[0].name}</div>
            <div className="score" style={{ fontSize: 20 }}>
              {rows[0].score.toLocaleString("es-ES")}
            </div>
            <div className="date">{rows[0].date}</div>
          </div>
          <div className="podium-slot bronze">
            <div className="rank-num">03</div>
            <div className="name">{rows[2].name}</div>
            <div className="score">{rows[2].score.toLocaleString("es-ES")}</div>
            <div className="date">{rows[2].date}</div>
          </div>
        </div>
      )}

      <div
        className="hall-table"
        role="region"
        aria-label="Tabla de puntuaciones"
        tabIndex={0}
      >
        <div className="th">
          <div>RANGO</div>
          <div>JUGADOR</div>
          <div>PUNTUACIÓN</div>
          <div>FECHA</div>
        </div>
        {rows.length === 0 ? (
          <div
            style={{
              color: "var(--ink-faint)",
              padding: "24px 18px",
              textAlign: "center",
            }}
          >
            AÚN NADIE HA JUGADO
          </div>
        ) : (
          rows.map((r, i) => (
            <div
              key={r.name + i}
              className={"tr" + medal(i)}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="rk">#{String(r.rank).padStart(2, "0")}</div>
              <div className="pl">{r.name}</div>
              <div className="sc">{r.score.toLocaleString("es-ES")}</div>
              <div className="dt">{r.date}</div>
            </div>
          ))
        )}
        {user && (
          <>
            <div className="tr you-label">▸ TU MEJOR MARCA EN {game.title}</div>
            <div
              className="tr you"
              style={{ animationDelay: `${rows.length * 50 + 50}ms` }}
            >
              {userBest === null ? (
                <div
                  className="pl"
                  style={{
                    gridColumn: "1 / -1",
                    textAlign: "center",
                    color: "var(--yellow)",
                  }}
                >
                  AÚN NO HAS JUGADO
                </div>
              ) : (
                <>
                  <div className="rk" style={{ color: "var(--yellow)" }} />
                  <div className="pl" style={{ color: "var(--yellow)" }}>
                    {user.name}
                  </div>
                  <div
                    className="sc"
                    style={{
                      color: "var(--yellow)",
                      textShadow: "0 0 6px rgba(245,255,0,0.5)",
                    }}
                  >
                    {userBest.toLocaleString("es-ES")}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 32 }}>
        <Link className="btn lg" href="/biblioteca">
          VOLVER A LA BIBLIOTECA
        </Link>
      </div>
    </div>
  );
}
