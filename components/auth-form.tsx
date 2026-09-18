"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/session-provider";

type Tab = "in" | "up";

export function AuthForm() {
  const router = useRouter();
  const { signIn, signOut } = useSession();
  const [tab, setTab] = useState<Tab>("in");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [email, setEmail] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Decorativo: no se valida nada, ni el correo ni la contraseña viajan.
    signIn(user || "PLAYER1");
    router.push("/biblioteca");
  };

  const playAsGuest = () => {
    signOut();
    router.push("/biblioteca");
  };

  return (
    <div className="av-auth-wrap fade-in">
      <div className="auth-card">
        <div className="auth-header">
          <div className="mark" aria-hidden />
          <h2 className="neon-cyan">ARCADE VAULT</h2>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: "0.16em",
              marginTop: 6,
            }}
          >
            ACCESO AL SISTEMA · v2.6
          </div>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={tab === "in" ? "on" : ""}
            onClick={() => setTab("in")}
            aria-pressed={tab === "in"}
          >
            INICIAR SESIÓN
          </button>
          <button
            type="button"
            className={tab === "up" ? "on" : ""}
            onClick={() => setTab("up")}
            aria-pressed={tab === "up"}
          >
            CREAR CUENTA
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="av-user">Usuario</label>
            <input
              id="av-user"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="px_kai"
            />
          </div>
          {tab === "up" && (
            <div className="field slide-in">
              <label htmlFor="av-email">Correo electrónico</label>
              <input
                id="av-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jugador@vault.gg"
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="av-pass">Contraseña</label>
            <input
              id="av-pass"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            className="btn lg"
            type="submit"
            style={{ width: "100%", marginTop: 8 }}
          >
            {tab === "in" ? "ENTRAR AL VAULT" : "CREAR Y JUGAR"}
          </button>
        </form>

        <button
          className="btn ghost"
          type="button"
          style={{ width: "100%", marginTop: 10 }}
          onClick={playAsGuest}
        >
          JUGAR COMO INVITADO
        </button>

        <div className="auth-divider">O CONTINÚA CON</div>
        <div className="social">
          {/* Decorativos: no hay OAuth en esta spec. */}
          <button className="btn ghost" type="button">
            ◆ GOOGLE
          </button>
          <button className="btn ghost" type="button">
            ▣ GITHUB
          </button>
        </div>

        <div
          style={{
            marginTop: 18,
            textAlign: "center",
            fontSize: 11,
            color: "var(--ink-faint)",
            letterSpacing: "0.1em",
          }}
        >
          AL ENTRAR ACEPTAS LOS TÉRMINOS DEL SALÓN ARCADE
        </div>
      </div>
    </div>
  );
}
