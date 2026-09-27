import { LibraryBrowser } from "@/components/library-browser";
import { getCategorias, getGames } from "@/lib/supabase/games";

export default async function Biblioteca() {
  const [games, categorias] = await Promise.all([getGames(), getCategorias()]);

  return (
    <div className="fade-in">
      <section className="av-hero">
        <h1 className="flicker">ARCADE VAULT</h1>
        <div className="sub">
          INSERTA UNA MONEDA PARA JUGAR <span className="blink">_</span>
        </div>
      </section>

      <LibraryBrowser games={games} categorias={categorias} />
    </div>
  );
}
