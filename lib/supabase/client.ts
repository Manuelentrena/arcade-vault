import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

/**
 * Cliente para componentes de navegador.
 *
 * Las dos variables son públicas a propósito: Next las incrusta en el bundle.
 * Lo que protege los datos es la RLS de `profiles`, no el secreto de la clave.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
