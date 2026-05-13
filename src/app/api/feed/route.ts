import { NextRequest } from "next/server";
import { getRecentMints } from "@/lib/server/state";
import { subscribe } from "@/lib/server/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/feed
 *
 * Server-sent events stream of recent mints. Sends a backfill of the
 * last 25 mints on connect and then streams new ones in real time.
 */
export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();
  const backfill = await getRecentMints(25);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };

      // Backfill recent activity.
      for (const mint of backfill.reverse()) {
        send({ type: "mint", mint });
      }
      send({ type: "live" });

      const unsubscribe = subscribe((event) => send(event));
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // controller may already be closed; ignore
        }
      }, 25_000);

      const close = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Abort handling — best-effort, browsers may not always signal.
      _req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
