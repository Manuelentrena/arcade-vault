import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Leaderboard } from "@/components/leaderboard";
import { getGameBySlug } from "@/lib/supabase/games";
import { getLeaderboard } from "@/lib/supabase/scores";

function stars(dificultad: number): string {
  return Array.from({ length: 5 }, (_, i) => (i < dificultad ? "★" : "☆")).join(
    " ",
  );
}

function jugadoresLabel(jugadores: number): string {
  return jugadores === 1 ? "1 JUGADOR" : `${jugadores} JUGADORES`;
}

function perifericosLabel(perifericos: string[]): string {
  const labels: Record<string, string> = { teclado: "TECLADO", raton: "RATÓN" };
  const nombres = perifericos.map((p) => labels[p]);
  return nombres.length === 1 ? `SOLO ${nombres[0]}` : nombres.join(" / ");
}

export default async function GameDetailPage(props: PageProps<"/juego/[id]">) {
  const { id } = await props.params;
  const [game, scores] = await Promise.all([
    getGameBySlug(id),
    getLeaderboard(id, 10),
  ]);
  if (!game) notFound();

  return (
    <div className="av-detail fade-in">
      <div>
        <div className="detail-cover">
          {game.image ? (
            <Image
              className="cover-bg cover-shot"
              src={game.image}
              alt=""
              aria-hidden
              fill
              priority
              sizes="(max-width: 980px) 100vw, 560px"
            />
          ) : (
            <div className={"cover-bg " + game.cover} aria-hidden />
          )}
        </div>
        <div style={{ marginTop: 20 }} className="detail-info">
          <div className="detail-tags">
            <span>{game.cat}</span>
            <span>{jugadoresLabel(game.jugadores)}</span>
            <span>{perifericosLabel(game.perifericos)}</span>
            <span>RETRO 1985</span>
          </div>
          <h2 className="neon-cyan">{game.title}</h2>
          <p>{game.long}</p>
          <div className="stat-strip">
            <div>
              <div className="l">Partidas</div>
              <div className="v">{game.plays}</div>
            </div>
            <div>
              <div className="l">Mejor global</div>
              <div
                className="v"
                style={{
                  color: "var(--magenta)",
                  textShadow: "0 0 6px rgba(255,0,110,0.5)",
                }}
              >
                {game.best === null ? "—" : game.best.toLocaleString("es-ES")}
              </div>
            </div>
            <div>
              <div className="l">Dificultad</div>
              <div
                className="v"
                style={{
                  color: "var(--yellow)",
                  textShadow: "0 0 6px rgba(245,255,0,0.5)",
                }}
              >
                {stars(game.dificultad)}
              </div>
            </div>
          </div>
          <div className="detail-actions">
            <Link className="btn xl pulse" href={`/jugar/${game.id}`}>
              ▶ JUGAR AHORA
            </Link>
            <Link className="btn ghost lg" href="/biblioteca">
              VOLVER AL VAULT
            </Link>
          </div>
        </div>
      </div>

      <aside>
        <Leaderboard rows={scores} />
      </aside>
    </div>
  );
}
