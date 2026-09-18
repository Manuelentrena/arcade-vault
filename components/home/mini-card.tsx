import Link from "next/link";
import type { Game } from "@/lib/games";

/** Versión compacta de la tarjeta de la biblioteca, para el carril del home. */
export function MiniCard({ game }: { game: Game }) {
  return (
    <Link className="mini-card" href={`/juego/${game.id}`}>
      <div className="mini-cover">
        <div className={"cover-bg " + game.cover} aria-hidden />
      </div>
      <div className="mini-meta">
        <div className="mini-title">{game.title}</div>
        <div className="mini-cat">{game.cat}</div>
      </div>
    </Link>
  );
}
