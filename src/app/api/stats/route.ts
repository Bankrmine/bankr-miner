import { bankrConfigured, tokenLaunched } from "@/lib/server/bankr";
import { getStats } from "@/lib/server/state";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getStats();
  return Response.json({
    ...stats,
    bankrConfigured: bankrConfigured(),
    tokenLaunched: tokenLaunched(),
  });
}
