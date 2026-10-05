import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { replayArkanoid, type ArkanoidActionLog } from "@/lib/arkanoid-replay";

export const runtime = "nodejs";

/**
 * Tope anti-abuso: lo que se alcance primero, sin reproducir nada por
 * encima. Más alto que los otros cuatro motores (60.000) porque ARKANOID es
 * el único con un canal de muestreo continuo (`paddle_x`, SPEC 36).
 */
const MAX_ENTRIES = 150_000;
const MAX_DURATION_MS = 45 * 60 * 1000;

const ACTION_TYPES = new Set([
  "left_down",
  "left_up",
  "right_down",
  "right_up",
  "serve",
  "pause",
  "resume",
  "paddle_x",
]);

type ValidatePayload = {
  slug: string;
  token: string;
  log: ArkanoidActionLog;
};

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

/** Valida la forma del registro recibido antes de fiarse de él para nada más. */
function parseLog(value: unknown): ArkanoidActionLog | null {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !ACTION_TYPES.has((entry as { type?: unknown }).type as string) ||
      typeof (entry as { t?: unknown }).t !== "number" ||
      !Number.isFinite((entry as { t: number }).t)
    ) {
      return null;
    }
    if (
      (entry as { type: string }).type === "paddle_x" &&
      (typeof (entry as { x?: unknown }).x !== "number" ||
        !Number.isFinite((entry as { x: number }).x))
    ) {
      return null;
    }
  }
  return value as ArkanoidActionLog;
}

function parsePayload(body: unknown): ValidatePayload | null {
  if (typeof body !== "object" || body === null) return null;
  const { slug, token, log } = body as Record<string, unknown>;
  if (typeof slug !== "string" || !slug) return null;
  if (typeof token !== "string" || !token) return null;
  const parsedLog = parseLog(log);
  if (!parsedLog) return null;
  return { slug, token, log: parsedLog };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "LA PETICIÓN NO ES JSON VÁLIDO." }, 400);
  }

  const payload = parsePayload(body);
  if (!payload) {
    return json({ error: "PETICIÓN INVÁLIDA." }, 400);
  }
  const { slug, token, log } = payload;

  // Tope de tamaño/duración antes de tocar la base de datos o reproducir nada.
  if (log.length > MAX_ENTRIES) {
    return json({ error: "REGISTRO DE ACCIONES DEMASIADO GRANDE." }, 413);
  }
  const duration = log.reduce((max, entry) => Math.max(max, entry.t), 0);
  if (duration > MAX_DURATION_MS) {
    return json({ error: "PARTIDA DEMASIADO LARGA." }, 413);
  }

  const supabase = await createClient();

  // El usuario que hace esta petición tiene que ser el mismo que abrió la
  // sesión de partida: una verificación adicional a la que ya hace
  // `verify_game_session` sobre el propio token.
  const { data: claims } = await supabase.auth.getClaims();
  const requestUid = claims?.claims?.sub;
  if (!requestUid) {
    return json({ error: "SESIÓN NO VÁLIDA." }, 401);
  }

  const { data: session, error: sessionError } = await supabase
    .rpc("verify_game_session", { p_token: token })
    .single();
  if (sessionError || !session) {
    return json({ error: "TOKEN DE SESIÓN NO VÁLIDO." }, 400);
  }
  if (session.uid !== requestUid) {
    return json({ error: "TOKEN DE SESIÓN NO VÁLIDO." }, 400);
  }

  const { data: game } = await supabase
    .from("games")
    .select("id, vidas")
    .eq("slug", slug)
    .maybeSingle();
  if (!game || game.id !== session.gid) {
    return json({ error: "JUEGO NO VÁLIDO PARA ESTA SESIÓN." }, 400);
  }

  const result = replayArkanoid(log, session.seed, game.vidas);
  if (!result.over) {
    return json({ error: "LA PARTIDA REPRODUCIDA NO HA TERMINADO." }, 400);
  }

  const { data: proof, error: proofError } = await supabase.rpc(
    "issue_score_proof",
    { p_token: token, p_score: result.score, p_level: result.level },
  );
  if (proofError || !proof) {
    return json({ error: "NO SE PUDO EMITIR LA PRUEBA DE SCORE." }, 400);
  }

  return json({ score: result.score, level: result.level, proof }, 200);
}
