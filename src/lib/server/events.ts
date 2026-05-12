/**
 * Tiny in-process event bus used by SSE endpoints to broadcast mining
 * events to the live feed page. Phase 2 will replace this with a real
 * pub/sub (Redis / Postgres LISTEN/NOTIFY).
 */
import type { MintRecord } from "./state";

export type FeedEvent =
  | { type: "mint"; mint: MintRecord }
  | { type: "halving"; era: number }
  | { type: "stats"; mintCount: number; era: number };

type Listener = (event: FeedEvent) => void;

const KEY = "__bankr_miner_events__";

type Bus = {
  listeners: Set<Listener>;
};

function load(): Bus {
  const g = globalThis as unknown as Record<string, unknown>;
  let bus = g[KEY] as Bus | undefined;
  if (!bus) {
    bus = { listeners: new Set() };
    g[KEY] = bus;
  }
  return bus;
}

export function subscribe(listener: Listener): () => void {
  const bus = load();
  bus.listeners.add(listener);
  return () => bus.listeners.delete(listener);
}

export function publish(event: FeedEvent) {
  const bus = load();
  for (const l of bus.listeners) {
    try {
      l(event);
    } catch {
      // ignore listener errors
    }
  }
}
