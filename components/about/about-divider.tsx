/** Banda de píxeles parpadeantes entre las dos mitades de la página. */
export function AboutDivider() {
  return (
    <div className="about-divider reveal" aria-hidden>
      <div className="div-bar" />
      <div className="div-pixels">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} style={{ animationDelay: i * 80 + "ms" }} />
        ))}
      </div>
      <div className="div-bar" />
    </div>
  );
}
