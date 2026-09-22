import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Retorno de OAuth. Supabase manda aquí con un `code` de un solo uso que hay
 * que canjear por la sesión; las cookies las escribe el cliente de servidor.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/biblioteca";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(absolute(request, safeNext(next)));
    }
    console.error(error);
  }

  return NextResponse.redirect(absolute(request, "/auth?error=oauth"));
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
