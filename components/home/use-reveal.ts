"use client";

import { useEffect } from "react";

/**
 * Hace aparecer las secciones `.reveal` del home según entran en pantalla.
 *
 * El CSS las deja visibles por defecto: es este hook el que las oculta al
 * montar añadiendo `armed`, y las devuelve con `in` al intersectar. Así, sin
 * JavaScript o con `prefers-reduced-motion`, la página se ve entera en vez de
 * quedarse en blanco.
 */
export function useReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = document.querySelectorAll<HTMLElement>(".reveal");
    els.forEach((el) => el.classList.add("armed"));

    const reveal = (el: Element) => {
      el.classList.add("in");
      io.unobserve(el);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) reveal(entry.target);
        });
        // El observador sólo avisa al cruzar el 12%: una sección muy alta que
        // asoma por arriba, o una que un salto de scroll dejó atrás sin llegar
        // a intersectar, se quedarían ocultas para siempre. Aquí se revela
        // todo lo que ya ha alcanzado la pantalla.
        const fold = document.documentElement.clientHeight;
        els.forEach((el) => {
          if (el.getBoundingClientRect().top < fold) reveal(el);
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, []);
}
