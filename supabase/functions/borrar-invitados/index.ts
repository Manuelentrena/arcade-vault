// SPEC 08 — Purga de invitados.
//
// La dispara `public.purge_guests_tick()` desde `pg_cron` a través de `pg_net`,
// una vez al día. Postgres filtra (`stale_guest_ids`) y esta función orquesta:
// el borrado tiene que pasar por el Admin API, porque un `delete` en SQL salta
// las cascadas y el estado interno de GoTrue.
//
// `pg_net` dispara y no espera, así que nadie lee esta respuesta. El rastro de
// la pasada queda en `public.guest_cleanup_runs`.

// Versión fijada, no `@2`. Un major flotante hace que un redespliegue dentro de
// meses traiga otra librería sin avisar, y una versión recién publicada puede
// romper el bundler del CLI si sus dependencias npm aún no han propagado.
import { createClient } from "jsr:@supabase/supabase-js@2.116.0";

// Tope por pasada. Un histórico grande agotaría el tiempo de la función; el
// resto se drena en pasadas sucesivas.
const BATCH_LIMIT = 200;

/** Comparación en tiempo constante: un `===` filtra el secreto por su duración. */
function secretsMatch(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  // La longitud sí se filtra, y es información que no sirve de nada.
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/**
 * Los errores de supabase-js no son `Error`: son objetos planos
 * (`PostgrestError`, `AuthError`). Un `String(e)` sobre ellos deja
 * "[object Object]" en la bitácora, que es justo donde hace falta el detalle.
 */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") {
      return o.code ? `${o.code}: ${o.message}` : o.message;
    }
    return JSON.stringify(e);
  }
  return String(e);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // 1. Autorización. El bearer es PURGE_SECRET, un secreto propio: la clave de
  //    servicio que se usa más abajo nunca viaja en la petición.
  const expected = Deno.env.get("PURGE_SECRET") ?? "";
  const received = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !secretsMatch(received, expected)) {
    return json({ error: "no autorizado" }, 401);
  }

  // 2. Parámetros. El plazo es de entorno para poder cambiarlo sin migración.
  const days = Number(Deno.env.get("GUEST_RETENTION_DAYS") ?? "30");
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let candidates = 0;
  let deleted = 0;
  let failed = 0;
  let error: string | null = null;

  try {
    // 3. Selección. El filtro vive en SQL; aquí sólo llega la lista de uuid.
    const { data, error: rpcError } = await admin.rpc("stale_guest_ids", {
      p_days: days,
      p_limit: BATCH_LIMIT,
    });
    if (rpcError) throw rpcError;

    const ids: string[] = data ?? [];
    candidates = ids.length;

    if (dryRun) {
      // Ensayo: se cuenta lo que se habría borrado, no se toca nada.
      deleted = candidates;
    } else {
      // 4. Borrado. La fila de public.profiles cae en cascada (SPEC 06).
      //    Un fallo suelto no aborta la pasada.
      for (const id of ids) {
        const { error: delError } = await admin.auth.admin.deleteUser(id);
        if (delError) {
          failed++;
          console.error(`borrar-invitados: fallo al borrar ${id}: ${delError.message}`);
        } else {
          deleted++;
        }
      }
    }
  } catch (e) {
    error = describeError(e);
    console.error(`borrar-invitados: pasada abortada: ${error}`);
  }

  // 5. Bitácora. Una fila por pasada, también cuando falla: una pasada sin fila
  //    es una pasada que no llegó.
  const { error: logError } = await admin
    .from("guest_cleanup_runs")
    .insert({ dry_run: dryRun, deleted, failed, error });
  if (logError) {
    console.error(`borrar-invitados: no se pudo escribir la bitácora: ${logError.message}`);
  }

  // 6. Respuesta. El cron no la ve; sirve para invocarla a mano.
  return json({ dry_run: dryRun, candidates, deleted, failed, error });
});
