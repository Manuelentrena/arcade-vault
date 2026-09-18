type Kind = "HEART" | "BROWSER" | "PLANT";

/** Los tres iconos de píxeles de los destacados, tal cual salen de la maqueta. */
export function HighlightIcon({ kind }: { kind: Kind }) {
  if (kind === "HEART") {
    return (
      <svg className="hl-icon" viewBox="0 0 16 16" aria-hidden>
        <g fill="currentColor">
          <rect x="2" y="3" width="4" height="2" />
          <rect x="10" y="3" width="4" height="2" />
          <rect x="1" y="4" width="2" height="4" />
          <rect x="13" y="4" width="2" height="4" />
          <rect x="2" y="8" width="2" height="2" />
          <rect x="12" y="8" width="2" height="2" />
          <rect x="3" y="9" width="10" height="2" />
          <rect x="4" y="11" width="8" height="2" />
          <rect x="5" y="12" width="6" height="2" />
          <rect x="6" y="13" width="4" height="1" />
          <rect x="7" y="14" width="2" height="1" />
        </g>
      </svg>
    );
  }

  if (kind === "BROWSER") {
    return (
      <svg className="hl-icon" viewBox="0 0 16 16" aria-hidden>
        <g fill="currentColor">
          <rect
            x="1"
            y="2"
            width="14"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <rect x="1" y="2" width="14" height="3" />
          <rect x="3" y="3" width="1" height="1" fill="#0a0a0f" />
          <rect x="5" y="3" width="1" height="1" fill="#0a0a0f" />
          <rect x="7" y="3" width="1" height="1" fill="#0a0a0f" />
          <rect x="3" y="7" width="4" height="1" />
          <rect x="3" y="9" width="6" height="1" />
          <rect x="3" y="11" width="3" height="1" />
        </g>
      </svg>
    );
  }

  return (
    <svg className="hl-icon" viewBox="0 0 16 16" aria-hidden>
      <g fill="currentColor">
        <rect x="7" y="2" width="2" height="10" />
        <rect x="4" y="4" width="3" height="2" />
        <rect x="9" y="6" width="3" height="2" />
        <rect x="3" y="3" width="2" height="2" />
        <rect x="11" y="5" width="2" height="2" />
        <rect x="3" y="12" width="10" height="2" />
        <rect x="4" y="14" width="8" height="1" />
      </g>
    </svg>
  );
}

export type { Kind };
