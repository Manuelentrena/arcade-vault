"use client";

import Link from "next/link";
import { HomeSilhouettes } from "@/components/home/home-silhouettes";
import { useReveal } from "@/components/use-reveal";

/**
 * Cliente por el hook: `useReveal` arma las secciones `.reveal` del resto de
 * la página, que son componentes de servidor.
 */
export function HomeHero() {
  useReveal();

  return (
    <section className="home-hero">
      <HomeSilhouettes />
      <div className="home-hero-inner">
        <div className="hero-eyebrow pixel neon-yellow">
          ▸ INSERTA UNA MONEDA<span className="blink">_</span>
        </div>
        <h1 className="home-title">
          <span className="line-1">EL ARCADE</span>
          <span className="line-2">CLÁSICO ESTÁ</span>
          <span className="line-3">DE VUELTA</span>
        </h1>
        <p className="home-sub">
          Juega los mejores clásicos directamente en tu navegador.
          <br />
          Sin descargas. Sin costo. Solo diversión.
        </p>
        <div className="home-ctas">
          <Link className="btn xl pulse" href="/biblioteca">
            ▶ EXPLORAR JUEGOS
          </Link>
          <Link className="btn xl magenta" href="/auth">
            ✦ CREAR CUENTA
          </Link>
        </div>
      </div>
      {/* Fuera de `home-hero-inner`: dentro se solapaba con los CTA. */}
      <div className="hero-scroll" aria-hidden>
        <span>DESLIZA</span>
        <span className="arrow">▼</span>
      </div>
    </section>
  );
}
