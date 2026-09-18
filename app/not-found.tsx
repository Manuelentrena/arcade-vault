import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-32 text-center">
      <div className="pixel neon-magenta flicker text-6xl">404</div>
      <div className="pixel neon-cyan text-base">PANTALLA NO ENCONTRADA</div>
      <p className="mono text-ink-dim max-w-md text-xs tracking-[0.16em]">
        ESTA MÁQUINA NO EXISTE EN EL VAULT. INSERTA OTRA MONEDA{" "}
        <span className="blink">_</span>
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link className="btn lg" href="/biblioteca">
          VOLVER AL VAULT
        </Link>
        <Link className="btn ghost lg" href="/salon">
          SALÓN DE LA FAMA
        </Link>
      </div>
    </div>
  );
}
