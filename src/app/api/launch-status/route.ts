import {
  getDeployerStatus,
  getRecentBankrLaunches,
} from "@/lib/server/launchStatus";
import { getQueueSummary } from "@/lib/server/queue";
import { tokenLaunched } from "@/lib/server/bankr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/launch-status
 *
 * One call that powers the "pre-launch preview" badges on the landing
 * page: deployer wallet + Bankr Club status, live ecosystem stats from
 * /token-launches, and the IOU queue summary so visitors can see how
 * many $MINE are waiting to be settled the moment the launch lands.
 *
 * Upstream responses are cached server-side; this endpoint is safe to
 * poll every few seconds.
 */
export async function GET() {
  const [deployer, ecosystem] = await Promise.all([
    getDeployerStatus(),
    getRecentBankrLaunches(8),
  ]);
  const queue = await getQueueSummary();

  let phase: "no-key" | "pre-launch" | "live";
  if (!deployer.configured) phase = "no-key";
  else if (!tokenLaunched()) phase = "pre-launch";
  else phase = "live";

  return Response.json({
    phase,
    canDeploy: deployer.clubActive && !tokenLaunched(),
    deployer,
    ecosystem,
    queue,
  });
}
