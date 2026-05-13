import { Redis } from "@upstash/redis";

type RedisEnv = {
  url: string;
  token: string;
};

const GLOBAL_KEY = "__bankr_miner_redis__";

function redisEnv(): RedisEnv | null {
  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? null;
  const token =
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    null;

  if (!url || !token) return null;
  return { url, token };
}

export function redisConfigured(): boolean {
  return redisEnv() !== null;
}

export function getRedis(): Redis | null {
  const env = redisEnv();
  if (!env) return null;

  const g = globalThis as unknown as Record<string, unknown>;
  const existing = g[GLOBAL_KEY] as Redis | undefined;
  if (existing) return existing;

  const redis = new Redis({
    url: env.url,
    token: env.token,
    enableTelemetry: false,
  });
  g[GLOBAL_KEY] = redis;
  return redis;
}

export function decodeStored<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  if (typeof value === "object") return value as T;
  return null;
}
