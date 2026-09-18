import Link from "next/link";

type Tick = {
  player: string;
  game: string;
  score: number;
  when: string;
  color: "cyan" | "magenta" | "yellow" | "green";
};

/** Actividad decorativa: no sale de `lib/scores.ts` ni se persiste. */
const TICKER: Tick[] = [
  {
    player: "NEONFOX",
    game: "Caída",
    score: 184220,
    when: "hace 2 min",
    color: "magenta",
  },
  {
    player: "PX_KAI",
    game: "Glotón",
    score: 96400,
    when: "hace 5 min",
    color: "yellow",
  },
  {
    player: "Z3R0COOL",
    game: "Invasores",
    score: 54190,
    when: "hace 8 min",
    color: "green",
  },
  {
    player: "VAULT_07",
    game: "Rocas",
    score: 41200,
    when: "hace 12 min",
    color: "cyan",
  },
  {
    player: "GLITCHA",
    game: "Bloque Buster",
    score: 28450,
    when: "hace 18 min",
    color: "cyan",
  },
  {
    player: "ARKADYA",
    game: "Serpentina",
    score: 7820,
    when: "hace 24 min",
    color: "green",
  },
  {
    player: "CYBER_LU",
    game: "Ranaria",
    score: 18900,
    when: "hace 31 min",
    color: "yellow",
  },
];

const TOP = [
  { rank: 1, player: "NEONFOX", score: 312840 },
  { rank: 2, player: "PX_KAI", score: 248110 },
  { rank: 3, player: "M00NRYU", score: 196720 },
  { rank: 4, player: "VAULT_07", score: 154300 },
  { rank: 5, player: "GLITCHA", score: 138900 },
];

/** Clase de podio de la fila: sólo las tres primeras la llevan. */
function topClass(i: number): string {
  if (i === 0) return " top1";
  if (i === 1) return " top2";
  if (i === 2) return " top3";
  return "";
}

export function HomeActivity() {
  return (
    <section className="home-section reveal">
      <div className="section-head">
        <div className="kicker pixel neon-yellow">{"// 03"}</div>
        <h2 className="section-title">ACTIVIDAD EN VIVO</h2>
        <div className="section-rule" />
      </div>
      <div className="activity-grid">
        <div className="activity-card">
          <div className="ac-head">
            <div className="ac-title pixel">▸ ÚLTIMAS PUNTUACIONES</div>
          </div>
          <div className="ticker">
            {TICKER.map((r, i) => (
              <div
                key={r.player + r.game}
                className="tick-row"
                style={{ animationDelay: i * 60 + "ms" }}
              >
                <span className={"tk-p neon-" + r.color}>{r.player}</span>
                <span className="tk-mid">▸ {r.game}</span>
                <span className="tk-s">+{r.score.toLocaleString("es-ES")}</span>
                <span className="tk-t">{r.when}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="activity-card">
          <div className="ac-head">
            <div className="ac-title pixel neon-magenta">
              ▸ TOP JUGADORES · HOY
            </div>
            <Link className="lb-link" href="/salon">
              VER SALÓN →
            </Link>
          </div>
          <div className="top-list">
            {TOP.map((r, i) => (
              <div key={r.player} className={"top-row" + topClass(i)}>
                <span className="tp-rk">
                  #{String(r.rank).padStart(2, "0")}
                </span>
                <span className="tp-p">{r.player}</span>
                <span className="tp-s">{r.score.toLocaleString("es-ES")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
