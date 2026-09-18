import type { NextRequest } from "next/server";

type ContactPayload = {
  name: string;
  email: string;
  msg: string;
  website: string; // honeypot: siempre vacío en un envío humano
};

type ContactResponse =
  | { ok: true; simulated?: boolean }
  | { ok: false; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Ventana y cupo del rate limit. */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS = 3;

/**
 * Envíos recientes por IP. Es *best effort*: vive en memoria, así que se pierde
 * en cada reinicio y no se comparte entre instancias. Frena a un curioso con
 * curl, no a un atacante decidido.
 */
const recent = new Map<string, number[]>();

function json(body: ContactResponse, status: number) {
  return Response.json(body, { status });
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "desconocida";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_SENDS) {
    recent.set(ip, hits);
    return true;
  }
  hits.push(now);
  recent.set(ip, hits);
  return false;
}

/** Devuelve el primer fallo de validación, en el español en mayúsculas que pinta el terminal. */
function invalid(payload: ContactPayload): string | null {
  const name = payload.name.trim();
  const email = payload.email.trim();
  const msg = payload.msg.trim();

  if (name.length < 2 || name.length > 80) {
    return "EL NOMBRE DEBE TENER ENTRE 2 Y 80 CARACTERES.";
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "EL CORREO ELECTRÓNICO NO ES VÁLIDO.";
  }
  if (msg.length < 10 || msg.length > 2000) {
    return "EL MENSAJE DEBE TENER ENTRE 10 Y 2000 CARACTERES.";
  }
  return null;
}

export async function POST(request: NextRequest) {
  let payload: ContactPayload;
  try {
    const body = await request.json();
    payload = {
      name: String(body?.name ?? ""),
      email: String(body?.email ?? ""),
      msg: String(body?.msg ?? ""),
      website: String(body?.website ?? ""),
    };
  } catch {
    return json({ ok: false, error: "LA PETICIÓN NO ES JSON VÁLIDO." }, 400);
  }

  // Honeypot: el bot rellena un campo que ningún humano ve. Se le responde que
  // todo ha ido bien y no se envía ni se registra nada.
  if (payload.website.trim()) return json({ ok: true }, 200);

  if (rateLimited(clientIp(request))) {
    return json(
      { ok: false, error: "DEMASIADOS ENVÍOS. INTÉNTALO EN UNOS MINUTOS." },
      429,
    );
  }

  const error = invalid(payload);
  if (error) return json({ ok: false, error }, 400);

  const from = process.env.CONTACT_FROM_EMAIL ?? "onboarding@resend.dev";
  const to = process.env.CONTACT_TO_EMAIL ?? "";
  const text = `Nombre: ${payload.name.trim()}\nCorreo: ${payload.email.trim()}\n\n${payload.msg.trim()}`;

  // Sin clave el formulario sigue funcionando: es el camino de un clon recién
  // clonado y el que recorren las pruebas.
  if (!process.env.RESEND_API_KEY) {
    console.info(`[contacto] simulado — de ${from} a ${to}\n${text}`);
    return json({ ok: true, simulated: true }, 200);
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: payload.email.trim(),
      subject: `[Arcade Vault] Mensaje de ${payload.name.trim()}`,
      text,
    }),
  });

  if (!response.ok) {
    // El detalle se queda en el servidor: puede traer la respuesta del proveedor.
    console.error(
      `[contacto] Resend respondió ${response.status}: ${await response.text()}`,
    );
    return json(
      { ok: false, error: "NO SE PUDO ENVIAR EL MENSAJE. INTÉNTALO DE NUEVO." },
      502,
    );
  }

  return json({ ok: true }, 200);
}
