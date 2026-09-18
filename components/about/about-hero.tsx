import { HighlightIcon, type Kind } from "@/components/about/highlight-icon";

const HIGHLIGHTS: { kind: Kind; text: string; color: string }[] = [
  { kind: "HEART", text: "HECHO CON ❤️ PARA JUGADORES", color: "magenta" },
  {
    kind: "BROWSER",
    text: "JUEGOS EN HTML — CORREN EN CUALQUIER NAVEGADOR",
    color: "cyan",
  },
  { kind: "PLANT", text: "PROYECTO EN CONSTANTE CRECIMIENTO", color: "green" },
];

export function AboutHero() {
  return (
    <section className="about-hero">
      <div className="kicker pixel neon-yellow">▸ ACERCA DE</div>
      <h1 className="about-title">ACERCA DE ARCADE VAULT</h1>
      <p className="about-mission">
        ARCADE VAULT nació del amor por los videojuegos clásicos. Nuestra misión
        es preservar y celebrar los arcades que definieron una generación,
        haciéndolos accesibles para todos, en cualquier lugar y sin costo.
      </p>

      <div className="highlight-row">
        {HIGHLIGHTS.map((highlight, i) => (
          <div
            key={highlight.kind}
            className={"highlight " + highlight.color}
            style={{ transitionDelay: i * 80 + "ms" }}
          >
            <HighlightIcon kind={highlight.kind} />
            <div className="hl-text pixel">{highlight.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
