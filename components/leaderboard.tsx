import type { ScoreRow } from "@/lib/supabase/scores";

function medal(index: number): string {
  if (index === 0) return " top1";
  if (index === 1) return " top2";
  if (index === 2) return " top3";
  return "";
}

export function Leaderboard({ rows }: { rows: ScoreRow[] }) {
  return (
    <div className="leaderboard">
      <h3>MEJORES PUNTUACIONES</h3>
      {rows.length === 0 && (
        <div
          className="lb-empty"
          style={{ color: "var(--ink-faint)", padding: "24px 0" }}
        >
          AÚN NADIE HA JUGADO
        </div>
      )}
      {rows.map((r, i) => (
        <div key={r.name} className={"lb-row" + medal(i)}>
          <div className="rk">#{String(r.rank).padStart(2, "0")}</div>
          <div className="pl">
            {r.name}
            <div
              style={{
                fontSize: 10,
                color: "var(--ink-faint)",
                letterSpacing: "0.1em",
              }}
            >
              {r.date}
            </div>
          </div>
          <div className="sc">{r.score.toLocaleString("es-ES")}</div>
        </div>
      ))}
    </div>
  );
}
