"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Tab = "in" | "up";
type Status = "idle" | "sending" | "check-email" | "error";

const FALLBACK_ERROR = "ERROR DE CONEXIÓN CON EL VAULT";

/** El destino por defecto tras entrar; `?next=` lo sobreescribe. */
const HOME = "/biblioteca";

/**
 * Traduce el error crudo de Supabase. El detalle va a console.error: en
 * pantalla sólo mensajes que un jugador pueda leer.
 */
function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "CORREO O CONTRASEÑA INCORRECTOS";
  }
  if (
    m.includes("already registered") ||
    m.includes("already been registered")
  ) {
    return "ESE CORREO YA TIENE CUENTA";
  }
  if (m.includes("email not confirmed")) {
    return "CONFIRMA TU CORREO ANTES DE ENTRAR";
  }
  // Proveedor OAuth sin dar de alta en el panel de Supabase.
  if (
    m.includes("provider is not enabled") ||
    m.includes("unsupported provider")
  ) {
    return "ESE ACCESO NO ESTÁ DISPONIBLE AÚN";
  }
  return FALLBACK_ERROR;
}

/** Mismo invariante que el `check` de profiles.username. */
function normalizeName(name: string): string {
  return name.trim().toUpperCase().slice(0, 10);
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // La ruta que pidió el proxy antes de mandar aquí, si la hubo.
  const next = searchParams.get("next") ?? HOME;

  const [tab, setTab] = useState<Tab>("in");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
    };
  }, []);

  const rejectLocally = () => {
    setShake(true);
    shakeTimer.current = setTimeout(() => setShake(false), 400);
  };

  const fail = (message: string, raw?: unknown) => {
    if (raw) console.error(raw);
    setError(message);
    setStatus("error");
  };

  const signIn = async () => {
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });
    if (authError) {
      fail(translate(authError.message), authError);
      return;
    }
    router.push(next);
    // El layout resuelve la sesión en servidor: sin refresh el nav seguiría
    // pintando "Iniciar Sesión" hasta la siguiente navegación dura.
    router.refresh();
  };

  const signUp = async () => {
    const supabase = createClient();
    const username = normalizeName(user);

    // Un nombre ocupado se rechaza aquí: así el jugador lo cambia él, en vez
    // de que el trigger lo renombre a su espalda. Además no gasta un correo.
    const { data: taken } = await supabase
      .from("profiles")
      .select("username")
      .eq("username", username)
      .maybeSingle();

    if (taken) {
      fail("ESE NOMBRE YA ESTÁ PILLADO");
      return;
    }

    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: {
        data: { username },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    if (authError) {
      fail(translate(authError.message), authError);
      return;
    }
    setStatus("check-email");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;

    if (!looksLikeEmail(email) || pass.length < 6) {
      rejectLocally();
      return;
    }
    if (tab === "up") {
      const username = normalizeName(user);
      if (username.length < 2 || username.length > 10) {
        rejectLocally();
        return;
      }
    }

    setStatus("sending");
    try {
      if (tab === "in") await signIn();
      else await signUp();
    } catch (caught) {
      fail(FALLBACK_ERROR, caught);
    }
  };

  const oauth = async (provider: "google" | "github") => {
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Sin redirección automática: primero se comprueba el proveedor.
        skipBrowserRedirect: true,
      },
    });
    if (authError || !data?.url) {
      fail(translate(authError?.message ?? ""), authError);
      return;
    }

    // Un proveedor sin dar de alta responde 400 al endpoint de autorización.
    // Se pregunta antes de salir de la aplicación: así el jugador ve el
    // terminal rojo y no el JSON de error de Supabase.
    try {
      const probe = await fetch(data.url, { redirect: "manual" });
      if (probe.type !== "opaqueredirect" && !probe.ok) {
        const body = await probe.json().catch(() => null);
        fail(translate(body?.msg ?? body?.error_description ?? ""), body);
        return;
      }
    } catch {
      // Sin respuesta legible (CORS, red): se intenta la navegación igual.
    }

    window.location.assign(data.url);
  };

  const playAsGuest = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(HOME);
    router.refresh();
  };

  const switchTab = (to: Tab) => {
    setTab(to);
    setStatus("idle");
  };

  return (
    <div className="av-auth-wrap fade-in">
      <div className={"auth-card" + (shake ? " shake" : "")}>
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

        {status === "check-email" ? (
          <div className="terminal-success">
            <div className="term-bar">
              <span className="dot r" />
              <span className="dot y" />
              <span className="dot g" />
              <span className="term-title">VAULT-OS // TERMINAL</span>
            </div>
            <div className="term-body">
              <div className="line">
                <span className="prompt">vault@arcade:~$</span> ./signup
                --player={normalizeName(user)}
              </div>
              <div className="line dim">[OK] Registrando jugador…</div>
              <div className="line dim">[OK] Enviando confirmación…</div>
              <div className="line success">
                &gt; [OK] CUENTA CREADA. REVISA TU CORREO:{" "}
                {email.trim().toUpperCase()}
                <span className="caret">_</span>
              </div>
              <div style={{ marginTop: 18 }}>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setStatus("idle");
                    setTab("in");
                  }}
                >
                  VOLVER A INICIAR SESIÓN
                </button>
              </div>
            </div>
          </div>
        ) : status === "error" ? (
          <div className="terminal-success error">
            <div className="term-bar">
              <span className="dot r" />
              <span className="dot y" />
              <span className="dot g" />
              <span className="term-title">VAULT-OS // TERMINAL</span>
            </div>
            <div className="term-body">
              <div className="line">
                <span className="prompt">vault@arcade:~$</span>{" "}
                {tab === "in" ? "./login" : "./signup"}
              </div>
              <div className="line dim">[OK] Conectando con el vault…</div>
              <div className="line">[ERR] Acceso denegado.</div>
              <div className="line success">&gt; {error}</div>
              <div style={{ marginTop: 18 }}>
                {/* Vuelve al formulario sin tocar los campos: lo escrito sigue. */}
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => setStatus("idle")}
                >
                  REINTENTAR
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="auth-tabs">
              <button
                type="button"
                className={tab === "in" ? "on" : ""}
                onClick={() => switchTab("in")}
                aria-pressed={tab === "in"}
              >
                INICIAR SESIÓN
              </button>
              <button
                type="button"
                className={tab === "up" ? "on" : ""}
                onClick={() => switchTab("up")}
                aria-pressed={tab === "up"}
              >
                CREAR CUENTA
              </button>
            </div>

            <form onSubmit={submit} noValidate>
              {/* El campo Usuario sólo existe al registrarse: entrar pide
                  correo, y resolver nombre→correo obligaría a exponerlos. */}
              {tab === "up" && (
                <div className="field slide-in">
                  <label htmlFor="av-user">Usuario</label>
                  <input
                    id="av-user"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    placeholder="px_kai"
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="av-email">Correo electrónico</label>
                <input
                  id="av-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jugador@vault.gg"
                />
              </div>
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
                disabled={status === "sending"}
                style={{ width: "100%", marginTop: 8 }}
              >
                {status === "sending"
                  ? tab === "in"
                    ? "VERIFICANDO…"
                    : "CREANDO…"
                  : tab === "in"
                    ? "ENTRAR AL VAULT"
                    : "CREAR Y JUGAR"}
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
              <button
                className="btn ghost"
                type="button"
                onClick={() => oauth("google")}
              >
                ◆ GOOGLE
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => oauth("github")}
              >
                ▣ GITHUB
              </button>
            </div>
          </>
        )}

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
