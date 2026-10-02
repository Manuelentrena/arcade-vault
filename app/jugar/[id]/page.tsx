import { notFound } from "next/navigation";
import { GamePlayer, type RestoredRun } from "@/components/game-player";
import { getGameBySlug } from "@/lib/supabase/games";
import { getServerSession } from "@/lib/supabase/session";
import { getUserBestScore, startGameSession } from "@/lib/supabase/scores";

/** Un entero positivo y razonable, o nada: la URL la escribe cualquiera. */
function positiveInt(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export default async function GamePlayerPage(props: PageProps<"/jugar/[id]">) {
  const { id } = await props.params;
  const [game, session] = await Promise.all([
    getGameBySlug(id),
    getServerSession(),
  ]);
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
  // El token de sesión de partida (SPEC 29) se pide en toda carga, invitado
  // incluido: el motor lo necesita igual, aunque save_score luego rechace al
  // invitado por otra razón.
  const [initialBest, gameSession] = await Promise.all([
    session && !session.isGuest ? getUserBestScore(id, session.id) : null,
    startGameSession(id),
  ]);

  return (
    <GamePlayer
      game={game}
      restored={restored}
      initialBest={initialBest}
      gameSession={gameSession}
    />
  );
}
