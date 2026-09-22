import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresca el token de Supabase en cada petición y protege /jugar/[id].
 *
 * Next 16 deprecó `middleware.ts` en favor de `proxy.ts` con `export function
 * proxy`. Toda la documentación de Supabase sigue diciendo `middleware`: ese
 * fichero compila, pero Next no lo ejecuta y la sesión caduca en silencio.
 */
export async function proxy(request: NextRequest) {
  // La respuesta se crea antes que el cliente y se devuelve tal cual: si se
  // sustituye por otra, las cookies reescritas se pierden y el servidor y el
  // navegador acaban con sesiones distintas.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Entre createServerClient y getClaims() no va nada: cualquier código en
  // medio puede provocar cierres de sesión aleatorios.
  const { data } = await supabase.auth.getClaims();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/jugar/") && !data?.claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)",
  ],
};
