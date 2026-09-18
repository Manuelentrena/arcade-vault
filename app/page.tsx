import { HomeActivity } from "@/components/home/home-activity";
import { HomeFeatures } from "@/components/home/home-features";
import { HomeFinal } from "@/components/home/home-final";
import { HomeGames } from "@/components/home/home-games";
import { HomeHero } from "@/components/home/home-hero";
import { HomePricing } from "@/components/home/home-pricing";
import { HomeStats } from "@/components/home/home-stats";
import { GAMES } from "@/lib/games";

export default function Home() {
  return (
    <div className="home fade-in">
      <HomeHero />
      <HomeFeatures />
      <HomeGames games={GAMES.slice(0, 6)} />
      <HomeStats />
      <HomeActivity />
      <HomePricing />
      <HomeFinal />
    </div>
  );
}
