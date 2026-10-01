import { NextResponse } from "next/server";
import { getRecentScores, getTopPlayers } from "@/lib/supabase/scores";

export async function GET() {
  const [recent, top] = await Promise.all([getRecentScores(), getTopPlayers()]);
  return NextResponse.json({ recent, top });
}
