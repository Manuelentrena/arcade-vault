import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/types";

/**
 * Cliente para componentes y route handlers de servidor.
 *
 * Nunca se comparte entre peticiones: `cookies()` es por petición, así que hay
 * que crear uno nuevo en cada render.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Un componente de servidor no puede escribir cookies. Se ignora:
            // el refresco del token lo hace proxy.ts, que sí puede.
          }
        },
      },
    },
  );
}
