import { createClient } from "@/lib/supabase/server";

export type ScoreRow = {
  rank: number;
  name: string;
  score: number;
  date: string;
};

export type RecentScore = {
  player: string;
  game: string;
  score: number;
  when: string;
  // Mismos valores que GameColor en lib/supabase/games.ts, duplicado aquí
  // para no crear un ciclo de módulos entre games.ts y scores.ts.
  color: "cyan" | "magenta" | "yellow" | "green";
};

export type TopPlayer = {
  rank: number;
  player: string;
  score: number;
};

/** `created_at` llega como ISO 8601 de Postgres; se pinta en formato es-ES. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES");
}

/** "hace X min" / "hace X h" / "hace X d", calculado en el momento de la petición. */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
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

/** Mejor puntuación de un juego concreto, sin traer la tabla entera. */
export async function getBestScoreForGame(
  gameId: string,
): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("scores")
    .select("score")
    .eq("game_id", gameId)
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.score ?? null;
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

/** Últimas `limit` puntuaciones guardadas, de cualquier jugador y juego. */
export async function getRecentScores(limit = 7): Promise<RecentScore[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("scores")
    .select("score, created_at, profiles(username), games(nombre, color)")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    player: row.profiles?.username ?? "—",
    game: row.games?.nombre ?? "—",
    score: row.score,
    when: relativeTime(row.created_at),
    color: (row.games?.color ?? "cyan") as RecentScore["color"],
  }));
}

/** Mejor puntuación individual de cada jugador en cualquier juego, rankeada. */
export async function getTopPlayers(limit = 6): Promise<TopPlayer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("scores")
    .select("user_id, score, profiles(username)");

  const best = new Map<string, { player: string; score: number }>();
  for (const row of data ?? []) {
    const current = best.get(row.user_id);
    if (!current || row.score > current.score) {
      best.set(row.user_id, {
        player: row.profiles?.username ?? "—",
        score: row.score,
      });
    }
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}
