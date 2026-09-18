export type FeatureIconKind = "GAMEPAD" | "FREE" | "TROPHY" | "ROCKET";

/** Iconos pixel dibujados a base de rectángulos; el color lo hereda la tarjeta. */
export function FeatureIcon({ kind }: { kind: FeatureIconKind }) {
  if (kind === "GAMEPAD") {
    return (
      <svg className="ft-icon" viewBox="0 0 16 16" aria-hidden>
        <g fill="currentColor">
          <rect x="2" y="6" width="12" height="6" />
          <rect x="0" y="8" width="2" height="4" />
          <rect x="14" y="8" width="2" height="4" />
          <rect x="3" y="8" width="2" height="2" />
          <rect x="2" y="9" width="4" height="0.5" />
          <rect x="11" y="7" width="1.5" height="1.5" />
          <rect x="11" y="10" width="1.5" height="1.5" />
        </g>
      </svg>
    );
  }

  if (kind === "FREE") {
    return (
      <svg className="ft-icon" viewBox="0 0 16 16" aria-hidden>
        <g fill="currentColor">
          <rect
            x="3"
            y="3"
            width="10"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect x="5" y="6" width="1.5" height="4" />
          <rect x="5" y="6" width="4" height="1.5" />
          <rect x="5" y="8" width="3" height="1" />
          <rect x="10" y="6" width="1.5" height="4" />
        </g>
      </svg>
    );
  }

  if (kind === "TROPHY") {
    return (
      <svg className="ft-icon" viewBox="0 0 16 16" aria-hidden>
        <g fill="currentColor">
          <rect x="3" y="2" width="10" height="2" />
          <rect x="3" y="2" width="2" height="6" />
          <rect x="11" y="2" width="2" height="6" />
          <rect x="5" y="8" width="6" height="2" />
          <rect x="7" y="10" width="2" height="3" />
          <rect x="5" y="13" width="6" height="1.5" />
          <rect x="1" y="3" width="2" height="3" />
          <rect x="13" y="3" width="2" height="3" />
        </g>
      </svg>
    );
  }

  return (
    <svg className="ft-icon" viewBox="0 0 16 16" aria-hidden>
      <g fill="currentColor">
        <rect x="7" y="1" width="2" height="2" />
        <rect x="6" y="3" width="4" height="2" />
        <rect x="5" y="5" width="6" height="6" />
        <rect x="4" y="11" width="2" height="2" />
        <rect x="10" y="11" width="2" height="2" />
        <rect x="7" y="6" width="2" height="2" fill="#0a0a0f" />
        <rect x="6" y="13" width="1" height="2" />
        <rect x="9" y="13" width="1" height="2" />
      </g>
    </svg>
  );
}
