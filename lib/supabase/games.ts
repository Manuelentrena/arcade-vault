import { createClient } from "@/lib/supabase/server";
import { getBestScores } from "@/lib/supabase/scores";

export type GameColor = "cyan" | "magenta" | "yellow" | "green";
export type GameCat = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";

/** Valor del filtro de categoría de la biblioteca: "TODOS" o una GameCat real. */
export const TODOS = "TODOS" as const;
export type CatFilter = typeof TODOS | GameCat;

export type Categoria = { id: string; nombre: GameCat };

export type Game = {
  /** El slug de la fila en `games`; también es el segmento de URL. */
  id: string;
  title: string;
  short: string;
  long: string;
  cat: GameCat;
  cover: string | null;
  image: string | null;
  color: GameColor;
  /** Mejor puntuación real, null si nadie ha jugado todavía. */
  best: number | null;
  plays: number;
  dificultad: number;
  jugadores: number;
  perifericos: string[];
};

const GAME_COLUMNS =
  "id, slug, nombre, cover, image, color, short, long, plays, dificultad, jugadores, perifericos, categorias(nombre)";

function toGame(
  row: {
    id: string;
    slug: string;
    nombre: string;
    cover: string | null;
    image: string | null;
    color: string;
    short: string;
    long: string;
    plays: number;
    dificultad: number;
    jugadores: number;
    perifericos: string[];
    categorias: { nombre: string } | null;
  },
  best: Record<string, number>,
): Game {
  return {
    id: row.slug,
    title: row.nombre,
    short: row.short,
    long: row.long,
    cat: row.categorias!.nombre as GameCat,
    cover: row.cover,
    image: row.image,
    color: row.color as GameColor,
    best: best[row.id] ?? null,
    plays: row.plays,
    dificultad: row.dificultad,
    jugadores: row.jugadores,
    perifericos: row.perifericos,
  };
}

export async function getCategorias(): Promise<Categoria[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categorias")
    .select("id, nombre")
    .order("nombre");
  return (data ?? []) as Categoria[];
}

export async function getGames(): Promise<Game[]> {
  const supabase = await createClient();
  const [{ data }, best] = await Promise.all([
    // Por created_at, no por nombre: conserva el orden curado de la migración
    // (tetrix, asteroides, arkanoid) en vez del alfabético.
    supabase.from("games").select(GAME_COLUMNS).order("created_at"),
    getBestScores(),
  ]);

  return (data ?? []).map((row) => toGame(row, best));
}

export async function getGameBySlug(slug: string): Promise<Game | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("games")
    .select(GAME_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;

  const best = await getBestScores();
  return toGame(data, best);
}
