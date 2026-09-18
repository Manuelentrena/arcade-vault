const STATS = [
  { n: "12+", u: "JUEGOS", s: "Y CONTANDO" },
  { n: "MILES", u: "DE PARTIDAS", s: "JUGADAS CADA DÍA" },
  { n: "GLOBAL", u: "RANKING", s: "COMPITE CON EL MUNDO" },
];

export function HomeStats() {
  return (
    <section className="home-stats reveal">
      <div className="stats-inner">
        {STATS.map((st, i) => (
          <div
            key={st.u}
            className="stat-block"
            style={{ transitionDelay: i * 90 + "ms" }}
          >
            <div className="stat-n neon-yellow">{st.n}</div>
            <div className="stat-u pixel">{st.u}</div>
            <div className="stat-s">{st.s}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
