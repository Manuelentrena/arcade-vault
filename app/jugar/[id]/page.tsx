import { notFound } from "next/navigation";
import { GamePlayer, type RestoredRun } from "@/components/game-player";
import { getGameBySlug } from "@/lib/supabase/games";
import { getServerSession } from "@/lib/supabase/session";
import { getUserBestScore } from "@/lib/supabase/scores";

/** Un entero positivo y razonable, o nada: la URL la escribe cualquiera. */
function positiveInt(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export default async function GamePlayerPage(props: PageProps<"/jugar/[id]">) {
  const { id } = await props.params;
  const game = await getGameBySlug(id);
  if (!game) notFound();

  // Vuelta desde /auth con la partida de un invitado que acaba de entrar.
  // No se persiste nada: es la misma puntuación que ya tenía en pantalla.
  const params = await props.searchParams;
  const score = positiveInt(params.puntuacion);
  const restored: RestoredRun | undefined =
    score === null
      ? undefined
      : { score, level: positiveInt(params.nivel) ?? 1 };

  // Solo un usuario real (no invitado) tiene una marca que comparar; un
  // invitado nunca llega a guardar, así que su mejor marca no importa aquí.
  const session = await getServerSession();
  const initialBest =
    session && !session.isGuest ? await getUserBestScore(id, session.id) : null;

  return (
    <GamePlayer game={game} restored={restored} initialBest={initialBest} />
  );
}
