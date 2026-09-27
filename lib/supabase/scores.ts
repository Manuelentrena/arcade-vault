import { createClient } from "@/lib/supabase/server";

export type ScoreRow = {
  rank: number;
  name: string;
  score: number;
  date: string;
};

/** `created_at` llega como ISO 8601 de Postgres; se pinta en formato es-ES. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES");
}

/** `scores.game_id` es el uuid interno de `games`; las páginas solo conocen el slug. */
async function gameIdForSlug(slug: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("games")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id ?? null;
}

/** Top `limit` puntuaciones de un juego, más recientes primero en empate. */
export async function getLeaderboard(
  gameSlug: string,
  limit = 10,
): Promise<ScoreRow[]> {
  const gameId = await gameIdForSlug(gameSlug);
  if (!gameId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("scores")
    .select("score, created_at, profiles(username)")
    .eq("game_id", gameId)
    .order("score", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row, index) => ({
    rank: index + 1,
    name: row.profiles?.username ?? "—",
    score: row.score,
    date: formatDate(row.created_at),
  }));
}

/** Mejor puntuación de cada juego, mapeada por `game_id`. */
export async function getBestScores(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("scores").select("game_id, score");

  const best: Record<string, number> = {};
  for (const row of data ?? []) {
    if (best[row.game_id] === undefined || row.score > best[row.game_id]) {
      best[row.game_id] = row.score;
    }
  }
  return best;
}

/** Mejor puntuación de un usuario en un juego concreto, o null si no ha jugado. */
export async function getUserBestScore(
  gameSlug: string,
  userId: string,
): Promise<number | null> {
  const gameId = await gameIdForSlug(gameSlug);
  if (!gameId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("scores")
    .select("score")
    .eq("game_id", gameId)
    .eq("user_id", userId)
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.score ?? null;
}
