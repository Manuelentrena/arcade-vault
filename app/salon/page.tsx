import { HallOfFame, type GameHallData } from "@/components/hall-of-fame";
import { getGames } from "@/lib/supabase/games";
import { getLeaderboard, getUserBestScore } from "@/lib/supabase/scores";
import { getServerSession } from "@/lib/supabase/session";

export default async function HallOfFamePage() {
  const [games, session] = await Promise.all([getGames(), getServerSession()]);

  const entries = await Promise.all(
    games.map(async (game): Promise<[string, GameHallData]> => {
      const rows = await getLeaderboard(game.id, 12);
      const userBest = session
        ? await getUserBestScore(game.id, session.id)
        : null;
      return [game.id, { rows, userBest }];
    }),
  );
  const data = Object.fromEntries(entries);

  return <HallOfFame games={games} data={data} />;
}
