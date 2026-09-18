"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";

type Section = "inicio" | "biblioteca" | "salon";

function sectionOf(pathname: string): Section | null {
  if (pathname === "/") return "inicio";
  if (
    pathname.startsWith("/biblioteca") ||
    pathname.startsWith("/juego") ||
    pathname.startsWith("/jugar")
  ) {
    return "biblioteca";
  }
  if (pathname.startsWith("/salon")) return "salon";
  return null;
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, signOut } = useSession();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const current = sectionOf(pathname);
  const cls = (section: Section) => (current === section ? "active" : "");
  const close = () => setOpen(false);

  return (
    <>
      <nav className="av-nav">
        <Link className="logo" href="/" onClick={close}>
          <div className="logo-mark" aria-hidden />
          <div className="logo-text neon-cyan">
            ARCADE <span className="neon-magenta">VAULT</span>
          </div>
        </Link>

        <div className="links">
          <Link className={cls("inicio")} href="/">
            Inicio
          </Link>
          <Link className={cls("biblioteca")} href="/biblioteca">
            Biblioteca
          </Link>
          <Link className={cls("salon")} href="/salon">
            Salón de la Fama
          </Link>
        </div>

        <div className="spacer" />

        <div className="coin-counter">
          <span className="coin" aria-hidden />
          <span>CRÉDITOS · 03</span>
        </div>

        {user ? (
          <button className="btn ghost auth-btn" onClick={signOut}>
            {user.name} ▾
          </button>
        ) : (
          <Link className="btn auth-btn" href="/auth">
            Iniciar Sesión
          </Link>
        )}

        <button
          className="btn ghost hamburger"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={open}
        >
          ≡
        </button>
      </nav>

      <div
        className={"av-mobile-backdrop" + (open ? " open" : "")}
        onClick={close}
        aria-hidden
      />

      {/* Fuera de la pantalla cuando está cerrado: inert lo saca del foco y del árbol de accesibilidad. */}
      <aside
        className={"av-mobile-panel" + (open ? " open" : "")}
        inert={!open}
        aria-label="Menú de navegación"
      >
        <div
          className="pixel neon-cyan"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontSize: 11,
            marginBottom: 16,
          }}
        >
          MENÚ
          <button
            className="btn ghost"
            onClick={close}
            aria-label="Cerrar menú"
            style={{ padding: "6px 10px" }}
          >
            ✕
          </button>
        </div>
        <Link className={cls("inicio")} href="/" onClick={close}>
          Inicio
        </Link>
        <Link className={cls("biblioteca")} href="/biblioteca" onClick={close}>
          Biblioteca
        </Link>
        <Link className={cls("salon")} href="/salon" onClick={close}>
          Salón de la Fama
        </Link>
        <div style={{ flex: 1 }} />
        <div className="panel-session">
          {user ? (
            <>
              <div className="panel-user">{user.name}</div>
              <button
                className="btn ghost"
                onClick={() => {
                  signOut();
                  close();
                }}
              >
                CERRAR SESIÓN
              </button>
            </>
          ) : (
            <Link className="btn" href="/auth" onClick={close}>
              INICIAR SESIÓN
            </Link>
          )}
        </div>
        <div
          className="pixel"
          style={{
            fontSize: 9,
            color: "var(--ink-faint)",
            letterSpacing: "0.16em",
          }}
        >
          CRÉDITOS · 03
        </div>
      </aside>
    </>
  );
}
