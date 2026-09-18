/** Siluetas pixel de máquinas clásicas que flotan de fondo en el hero. */
export function HomeSilhouettes() {
  return (
    <div className="home-silos" aria-hidden>
      <svg className="silo s1" viewBox="0 0 40 32">
        <g fill="#00f5ff">
          <rect x="6" y="4" width="4" height="4" />
          <rect x="30" y="4" width="4" height="4" />
          <rect x="2" y="8" width="36" height="4" />
          <rect x="2" y="12" width="4" height="4" />
          <rect x="14" y="12" width="4" height="4" />
          <rect x="22" y="12" width="4" height="4" />
          <rect x="34" y="12" width="4" height="4" />
          <rect x="2" y="16" width="36" height="4" />
          <rect x="6" y="20" width="4" height="4" />
          <rect x="30" y="20" width="4" height="4" />
        </g>
      </svg>

      <svg className="silo s2" viewBox="0 0 32 32">
        <g fill="#ff006e">
          <rect x="8" y="0" width="16" height="4" />
          <rect x="4" y="4" width="24" height="4" />
          <rect x="0" y="8" width="32" height="12" />
          <rect x="0" y="20" width="6" height="6" />
          <rect x="10" y="20" width="4" height="6" />
          <rect x="18" y="20" width="4" height="6" />
          <rect x="26" y="20" width="6" height="6" />
        </g>
      </svg>

      <svg className="silo s3" viewBox="0 0 32 32">
        <g fill="#f5ff00">
          <rect x="10" y="0" width="12" height="4" />
          <rect x="6" y="4" width="20" height="4" />
          <rect x="4" y="8" width="6" height="6" />
          <rect x="22" y="8" width="6" height="6" />
          <rect x="2" y="14" width="28" height="10" />
          <rect x="6" y="24" width="4" height="4" />
          <rect x="14" y="24" width="4" height="4" />
          <rect x="22" y="24" width="4" height="4" />
        </g>
      </svg>

      <svg className="silo s4" viewBox="0 0 24 24">
        <g fill="#00ff88">
          <rect x="10" y="0" width="4" height="24" />
          <rect x="0" y="10" width="24" height="4" />
          <rect
            x="6"
            y="6"
            width="12"
            height="12"
            fill="none"
            stroke="#00ff88"
            strokeWidth="2"
          />
        </g>
      </svg>

      {/* s5: platillo */}
      <svg className="silo s5" viewBox="0 0 36 24">
        <g fill="#aa00ff">
          <rect x="14" y="2" width="8" height="4" />
          <rect x="10" y="6" width="16" height="4" />
          <rect x="4" y="10" width="28" height="4" />
          <rect x="0" y="14" width="36" height="4" />
          <rect x="6" y="18" width="4" height="2" />
          <rect x="16" y="18" width="4" height="2" />
          <rect x="26" y="18" width="4" height="2" />
        </g>
      </svg>

      {/* s6: moneda */}
      <svg className="silo s6" viewBox="0 0 20 20">
        <g fill="#ffcf3a">
          <rect x="6" y="0" width="8" height="2" />
          <rect x="2" y="2" width="16" height="2" />
          <rect x="0" y="4" width="20" height="12" />
          <rect x="2" y="16" width="16" height="2" />
          <rect x="6" y="18" width="8" height="2" />
          <rect x="8" y="4" width="4" height="12" fill="#0a0a0f" />
        </g>
      </svg>

      {/* s7: corazón */}
      <svg className="silo s7" viewBox="0 0 24 22">
        <g fill="#ff3060">
          <rect x="2" y="2" width="6" height="2" />
          <rect x="16" y="2" width="6" height="2" />
          <rect x="0" y="4" width="10" height="4" />
          <rect x="14" y="4" width="10" height="4" />
          <rect x="0" y="8" width="24" height="4" />
          <rect x="2" y="12" width="20" height="2" />
          <rect x="4" y="14" width="16" height="2" />
          <rect x="6" y="16" width="12" height="2" />
          <rect x="8" y="18" width="8" height="2" />
          <rect x="10" y="20" width="4" height="2" />
        </g>
      </svg>

      {/* s8: cruceta */}
      <svg className="silo s8" viewBox="0 0 24 24">
        <g fill="#00d4ff">
          <rect x="8" y="2" width="8" height="6" />
          <rect x="2" y="8" width="20" height="8" />
          <rect x="8" y="16" width="8" height="6" />
          <rect x="11" y="6" width="2" height="2" fill="#0a0a0f" />
          <rect x="11" y="16" width="2" height="2" fill="#0a0a0f" />
          <rect x="4" y="11" width="2" height="2" fill="#0a0a0f" />
          <rect x="18" y="11" width="2" height="2" fill="#0a0a0f" />
        </g>
      </svg>
    </div>
  );
}
