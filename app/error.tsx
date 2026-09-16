"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-32 text-center">
      <div className="pixel neon-magenta flicker text-3xl">
        ERROR DEL SISTEMA
      </div>
      <p className="mono text-ink-dim max-w-md text-xs tracking-[0.16em]">
        LA PLACA HA DEJADO DE RESPONDER. PUEDES REINTENTAR LA PARTIDA.
      </p>
      {error.digest && (
        <p className="mono text-ink-faint text-[10px] tracking-[0.16em]">
          CÓDIGO · {error.digest}
        </p>
      )}
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <button className="btn lg" onClick={reset}>
          REINTENTAR
        </button>
        <Link className="btn ghost lg" href="/">
          VOLVER AL VAULT
        </Link>
      </div>
    </div>
  );
}
