import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino del enlace del correo de confirmación (ver
 * supabase/templates/confirmation.html). Canjea el token_hash por una sesión y
 * deja al jugador dentro, sin pasar por el formulario.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/biblioteca";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(absolute(request, safeNext(next)));
    }
    console.error(error);
  }

  return NextResponse.redirect(absolute(request, "/auth?error=confirm"));
}

/** Sólo rutas internas: un `next` absoluto convertiría esto en redirector abierto. */
function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/biblioteca";
}

/**
 * Resuelve el destino contra la cabecera Host de la petición.
 *
 * `request.url` y `nextUrl.origin` devuelven el host con el que arrancó el
 * servidor (localhost), no aquel por el que entró el navegador. Si el jugador
 * llegó por 127.0.0.1, la cookie de sesión se queda en ese host y el redirect
 * a localhost aterriza sin sesión.
 */
function absolute(request: NextRequest, path: string): URL {
  const host = request.headers.get("host");
  const base = host ? `${request.nextUrl.protocol}//${host}` : request.url;
  return new URL(path, base);
}
