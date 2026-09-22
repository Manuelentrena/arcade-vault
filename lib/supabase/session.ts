import { createClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/supabase/user";

export type { SessionUser };

/**
 * Sesión leída en servidor desde las cookies. null si no hay.
 *
 * `getClaims()` verifica el JWT (no se fía de la cookie a ciegas); el nombre
 * visible vive en `profiles`, así que hace falta la segunda consulta.
 */
export async function getServerSession(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const id = data.claims.sub;
  // Una sesión anónima trae email como cadena vacía, no como null.
  const email =
    typeof data.claims.email === "string" && data.claims.email !== ""
      ? data.claims.email
      : null;
  const isGuest = data.claims.is_anonymous === true;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", id)
    .single();

  // Sin perfil no hay nombre que pintar: se trata como sesión inexistente.
  if (!profile) return null;

  return { id, name: profile.username, email, isGuest };
}
