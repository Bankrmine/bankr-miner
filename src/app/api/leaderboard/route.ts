import { getLeaderboard } from "@/lib/server/state";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ leaderboard: getLeaderboard(50) });
}
