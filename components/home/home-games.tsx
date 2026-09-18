import Link from "next/link";
import { MiniCard } from "@/components/home/mini-card";
import type { Game } from "@/lib/games";

export function HomeGames({ games }: { games: Game[] }) {
  return (
    <section className="home-section reveal">
      <div className="section-head">
        <div className="kicker pixel neon-cyan">{"// 02"}</div>
        <h2 className="section-title">JUEGOS DISPONIBLES AHORA</h2>
        <div className="section-rule" />
      </div>
      <div className="mini-rail">
        {games.map((game) => (
          <MiniCard key={game.id} game={game} />
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 24 }}>
        <Link className="btn lg" href="/biblioteca">
          VER TODOS LOS JUEGOS →
        </Link>
      </div>
    </section>
  );
}
