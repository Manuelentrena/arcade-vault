"use client";

import { useEffect, useRef, useState } from "react";
import { useReveal } from "@/components/use-reveal";

type Status = "idle" | "sending" | "sent" | "error";

const EMPTY = { name: "", email: "", msg: "", website: "" };

const FALLBACK_ERROR = "NO SE PUDO ENVIAR EL MENSAJE. INTÉNTALO DE NUEVO.";

/**
 * Único componente de cliente de `/acerca`: guarda el formulario, habla con
 * `POST /api/contacto` y, de paso, arma las secciones `.reveal` de la página.
 */
export function ContactForm() {
  useReveal();

  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState<Status>("idle");
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
    };
  }, []);

  const set = (field: keyof typeof EMPTY) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;

    // Un campo vacío ni sale del navegador: la maqueta sacude el formulario.
    if (!form.name.trim() || !form.email.trim() || !form.msg.trim()) {
      setShake(true);
      shakeTimer.current = setTimeout(() => setShake(false), 400);
      return;
    }

    setStatus("sending");
    try {
      const response = await fetch("/api/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setError(data?.error ?? FALLBACK_ERROR);
        setStatus("error");
        return;
      }

      setSentTo(form.name.trim().toUpperCase());
      setStatus("sent");
    } catch {
      setError(FALLBACK_ERROR);
      setStatus("error");
    }
  };

  return (
    <form
      className={"contact-form" + (shake ? " shake" : "")}
      onSubmit={onSubmit}
      noValidate
    >
      {status === "sent" ? (
        <div className="terminal-success">
          <div className="term-bar">
            <span className="dot r" />
            <span className="dot y" />
            <span className="dot g" />
            <span className="term-title">VAULT-OS // TERMINAL</span>
          </div>
          <div className="term-body">
            <div className="line">
              <span className="prompt">vault@arcade:~$</span>{" "}
              ./send_message --to=team
            </div>
            <div className="line dim">[OK] Conectando con servidor…</div>
            <div className="line dim">[OK] Validando contenido…</div>
            <div className="line dim">[OK] Transmitiendo paquete…</div>
            <div className="line success">
              &gt; MENSAJE RECIBIDO. TE RESPONDEREMOS PRONTO. GRACIAS, {sentTo}.
              <span className="caret">_</span>
            </div>
            <div style={{ marginTop: 18 }}>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setForm(EMPTY);
                  setStatus("idle");
                }}
              >
                ENVIAR OTRO MENSAJE
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
              ./send_message --to=team
            </div>
            <div className="line dim">[OK] Conectando con servidor…</div>
            <div className="line">[ERR] Transmisión interrumpida.</div>
            <div className="line success">&gt; {error}</div>
            <div style={{ marginTop: 18 }}>
              {/* Vuelve al formulario sin tocar `form`: lo escrito sigue ahí. */}
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
          <div className="field">
            <label htmlFor="av-contact-name">NOMBRE</label>
            <input
              id="av-contact-name"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="px_kai"
            />
          </div>
          <div className="field">
            <label htmlFor="av-contact-email">CORREO ELECTRÓNICO</label>
            <input
              id="av-contact-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
              placeholder="jugador@vault.gg"
            />
          </div>
          <div className="field">
            <label htmlFor="av-contact-msg">MENSAJE</label>
            <textarea
              id="av-contact-msg"
              rows={5}
              value={form.msg}
              onChange={(e) => set("msg")(e.target.value)}
              placeholder="Cuéntanos qué tienes en mente…"
            />
          </div>

          {/* Trampa para bots: invisible, fuera del tabulador y del árbol de accesibilidad. */}
          <input
            className="contact-hp"
            name="website"
            value={form.website}
            onChange={(e) => set("website")(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
          />

          <button
            className="btn xl press"
            type="submit"
            style={{ width: "100%" }}
            disabled={status === "sending"}
          >
            {status === "sending" ? "ENVIANDO…" : "▶  ENVIAR MENSAJE"}
          </button>
        </>
      )}
    </form>
  );
}
